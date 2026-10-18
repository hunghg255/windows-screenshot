// Screenshot is a private, local screenshot and annotation tool. Captures
// stay in memory until the user copies or saves them.
package main

import (
	"context"
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/egoist/mygo"
)

//go:embed tray.png
var trayIcon []byte

// CaptureMode is what a capture covers.
type CaptureMode string

const (
	CaptureFull   CaptureMode = "full"
	CaptureRegion CaptureMode = "region"
)

// CaptureRequest starts a capture.
type CaptureRequest struct {
	Mode CaptureMode `json:"mode"`
}

// CaptureData is the image a capture window shows.
type CaptureData struct {
	ID            string      `json:"id"`
	Image         string      `json:"image"`
	Width         int         `json:"width"`
	Height        int         `json:"height"`
	Mode          CaptureMode `json:"mode"`
	OverlayBounds *Rect       `json:"overlayBounds,omitempty"`
}

// SettingsState is what the settings window shows.
type SettingsState struct {
	Settings Settings `json:"settings"`
	Warning  string   `json:"warning"`
}

// SelectionChanged tells the region overlays the selected desktop rectangle,
// or null when there is none.
var SelectionChanged = mygo.NewEvent[*Rect]("selection-changed")

type state struct {
	mu sync.Mutex

	settingsWindow *mygo.Window
	captureWindow  *mygo.Window
	overlays       map[*mygo.Window]CaptureData
	tray           *mygo.Tray

	session string
	image   *image.RGBA
	data    *CaptureData
	desktop *DesktopLayout

	selectionStart *Point
	selectionOwner *mygo.Window
	selectionStop  chan struct{}

	settings   Settings
	warning    string
	configPath string
	registered *Shortcuts

	outputBusy, configBusy, importBusy bool
}

// quitting is read by listeners on the main thread, which must not lock.
var quitting atomic.Bool

var app = &state{overlays: map[*mygo.Window]CaptureData{}}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Window listeners run on the main thread, which window calls made while
// holding the lock wait for: they hand work that locks to a goroutine.

func (s *state) createWindow(view string, overlay bool) *mygo.Window {
	opts := mygo.WindowOptions{
		Title: "Screenshot", URL: "/#" + view, Hidden: true, BackgroundColor: "#0a0a0a", AutoHideMenuBar: true,
		Width: 1120, Height: 780, MinWidth: 640, MinHeight: 480,
	}
	if view == "settings" {
		opts.Width, opts.Height = 680, 600
	}
	if overlay {
		opts.Frameless, opts.DisableResize, opts.DisableShadow, opts.SkipTaskbar, opts.AlwaysOnTop = true, true, true, true, true
		opts.MinWidth, opts.MinHeight = 0, 0
	}
	win := mygo.NewWindow(opts)
	page := win.Page()
	page.SetPermissionHandler(func(mygo.PermissionRequest) bool { return false })
	page.SetWindowOpenHandler(func(mygo.WindowOpenRequest) *mygo.WindowOptions { return nil })
	page.OnWillNavigate(func(e *mygo.NavigateEvent) { e.PreventDefault() })
	return win
}

func (s *state) showSettings() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.settingsWindow != nil {
		s.settingsWindow.Show()
		s.settingsWindow.Focus()
		return
	}
	win := s.createWindow("settings", false)
	s.settingsWindow = win
	win.OnReadyToShow(win.Show)
	win.OnClose(func(e *mygo.CloseEvent) {
		if !quitting.Load() {
			e.PreventDefault()
			go win.Hide()
		}
	})
}

func (s *state) resetSelection() {
	if s.selectionStop != nil {
		close(s.selectionStop)
	}
	s.selectionStart, s.selectionOwner, s.selectionStop = nil, nil, nil
}

func (s *state) closeOverlays() {
	s.resetSelection()
	windows := make([]*mygo.Window, 0, len(s.overlays))
	for win := range s.overlays {
		windows = append(windows, win)
	}
	clear(s.overlays)
	for _, win := range windows {
		win.Destroy()
	}
}

func (s *state) broadcastSelection(r *Rect) {
	for win := range s.overlays {
		_ = SelectionChanged.Emit(win, r)
	}
}

func (s *state) clearCapture() {
	s.session, s.data, s.image, s.desktop = "", nil, nil, nil
	s.closeOverlays()
	old := s.captureWindow
	s.captureWindow = nil
	if old != nil && !old.IsDestroyed() {
		old.Destroy()
	}
}

func (s *state) showEditor() {
	old := s.captureWindow
	s.captureWindow = nil
	s.closeOverlays()
	if old != nil && !old.IsDestroyed() {
		old.Destroy()
	}
	win := s.createWindow("editor", false)
	s.captureWindow = win
	win.OnReadyToShow(func() { win.Show(); win.Focus() })
	win.OnClosed(func() {
		go func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			if s.captureWindow == win {
				s.clearCapture()
			}
		}()
	})
}

func (s *state) currentDisplays() []DesktopDisplay {
	var out []DesktopDisplay
	for _, d := range mygo.Screen.Displays() {
		b := d.Bounds
		out = append(out, DesktopDisplay{ID: d.ID, Bounds: Rect{X: b.X, Y: b.Y, Width: b.Width, Height: b.Height}, ScaleFactor: d.ScaleFactor})
	}
	return out
}

func (s *state) beginCapture(mode CaptureMode) error {
	s.mu.Lock()
	if s.session != "" {
		if s.captureWindow != nil {
			s.captureWindow.Show()
			s.captureWindow.Focus()
		}
		s.mu.Unlock()
		return nil
	}
	displays := s.currentDisplays()
	layout, err := desktopLayout(displays)
	if err != nil {
		s.mu.Unlock()
		return err
	}
	id := newID()
	s.session = id
	if s.settingsWindow != nil {
		s.settingsWindow.Hide()
	}
	s.mu.Unlock()

	fail := func(err error) error {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.session == id {
			s.clearCapture()
		}
		return err
	}
	// Let the settings window disappear before copying the screen.
	time.Sleep(220 * time.Millisecond)
	frames := make([]*image.RGBA, len(displays))
	for i, d := range displays {
		if frames[i], err = captureDisplay(d); err != nil {
			return fail(err)
		}
	}
	composite, err := compositeDesktop(layout, frames)
	if err != nil {
		return fail(err)
	}
	data := CaptureData{ID: id, Width: layout.Width, Height: layout.Height, Mode: mode}
	if mode == CaptureFull {
		if data.Image, err = pngDataURL(composite); err != nil {
			return fail(err)
		}
	}
	overlayImages := make([]string, len(frames))
	if mode == CaptureRegion {
		for i, frame := range frames {
			if overlayImages[i], err = pngDataURL(frame); err != nil {
				return fail(err)
			}
		}
	}

	s.mu.Lock()
	if s.session != id {
		s.mu.Unlock()
		return nil
	}
	s.desktop, s.image, s.data = &layout, composite, &data
	if mode == CaptureFull {
		s.showEditor()
		s.mu.Unlock()
		return nil
	}
	// Each overlay reports once when ready and once when closed.
	ready := make(chan struct{}, 2*len(displays))
	for i, d := range displays {
		win := s.createWindow("region", true)
		bounds := d.Bounds
		overlay := data
		overlay.Image, overlay.OverlayBounds = overlayImages[i], &bounds
		s.overlays[win] = overlay
		if s.captureWindow == nil {
			s.captureWindow = win
		}
		win.SetBounds(mygo.Rectangle{X: bounds.X, Y: bounds.Y, Width: bounds.Width, Height: bounds.Height})
		win.OnReadyToShow(func() { ready <- struct{}{} })
		lost := func() {
			go func() {
				s.mu.Lock()
				defer s.mu.Unlock()
				if _, ok := s.overlays[win]; ok {
					s.clearCapture()
				}
			}()
		}
		win.OnClosed(func() { ready <- struct{}{}; lost() })
		win.Page().OnDidFailLoad(func(*mygo.LoadError) { lost() })
		win.Page().OnRenderProcessGone(func(string) { lost() })
	}
	s.mu.Unlock()

	for range displays {
		select {
		case <-ready:
		case <-time.After(10 * time.Second):
			return fail(errors.New("Screen capture timed out."))
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session != id {
		return nil
	}
	cursor := mygo.Screen.CursorScreenPoint()
	focused := s.captureWindow
	for win, overlay := range s.overlays {
		win.ShowInactive()
		b := overlay.OverlayBounds
		if cursor.X >= b.X && cursor.X < b.X+b.Width && cursor.Y >= b.Y && cursor.Y < b.Y+b.Height {
			focused = win
		}
	}
	if focused != nil {
		focused.Focus()
	}
	return nil
}

func (s *state) assertSession(id string) error {
	if id == "" || s.session != id || s.image == nil || s.data == nil {
		return errors.New("This capture session has ended.")
	}
	return nil
}

func (s *state) finishCrop(id string, r Rect) error {
	if err := s.assertSession(id); err != nil {
		return err
	}
	valid := s.data.Mode == CaptureRegion && s.desktop != nil && validRect(r, s.data.Width, s.data.Height)
	if valid {
		valid = false
		for _, d := range s.desktop.Displays {
			valid = valid || intersects(r, s.desktop.pixels(d.Bounds))
		}
	}
	if !valid {
		return errors.New("Select a non-empty region containing a screen.")
	}
	cropped := image.NewRGBA(image.Rect(0, 0, r.Width, r.Height))
	for y := 0; y < r.Height; y++ {
		start := s.image.PixOffset(r.X, r.Y+y)
		copy(cropped.Pix[y*cropped.Stride:], s.image.Pix[start:start+r.Width*4])
	}
	url, err := pngDataURL(cropped)
	if err != nil {
		return err
	}
	s.image = cropped
	s.data = &CaptureData{ID: id, Image: url, Width: r.Width, Height: r.Height, Mode: CaptureFull}
	s.showEditor()
	return nil
}

func report(err error) {
	if err != nil {
		mygo.Dialog.Error("Screenshot", err.Error())
	}
}

func startFull()   { go func() { report(app.beginCapture(CaptureFull)) }() }
func startRegion() { go func() { report(app.beginCapture(CaptureRegion)) }() }

func (s *state) refreshTray() {
	if s.tray == nil {
		return
	}
	s.tray.SetMenu(mygo.NewMenu([]*mygo.MenuItem{
		{Label: "Full screen (all displays)", Click: func(*mygo.MenuItem, *mygo.Window) { startFull() }},
		{Label: "Select region across displays", Click: func(*mygo.MenuItem, *mygo.Window) { startRegion() }},
		mygo.Separator(),
		{Label: "Settings", Click: func(*mygo.MenuItem, *mygo.Window) { go s.showSettings() }},
		{Label: "Quit", Click: func(*mygo.MenuItem, *mygo.Window) { go mygo.App.Quit() }},
	}))
}

// Screenshot is what the app's pages call.
type Screenshot struct{}

type role int

const (
	roleSettings role = iota
	roleCapture
	roleAny
)

// authorize locks the state for a call from a window of the given role.
func (s *state) authorize(ctx context.Context, r role) (*mygo.Window, error) {
	win := mygo.CallerWindow(ctx)
	s.mu.Lock()
	_, overlay := s.overlays[win]
	capture := win != nil && (win == s.captureWindow || overlay)
	settings := win != nil && win == s.settingsWindow
	if (r == roleSettings && !settings) || (r == roleCapture && !capture) || (r == roleAny && !settings && !capture) {
		s.mu.Unlock()
		return nil, errors.New("Unauthorized request.")
	}
	return win, nil
}

// Settings returns the settings and why they may not be the saved ones.
func (Screenshot) Settings(ctx context.Context) (SettingsState, error) {
	if _, err := app.authorize(ctx, roleSettings); err != nil {
		return SettingsState{}, err
	}
	defer app.mu.Unlock()
	return SettingsState{Settings: app.settings, Warning: app.warning}, nil
}

// UpdateShortcuts registers new shortcuts and saves them.
func (Screenshot) UpdateShortcuts(ctx context.Context, next Shortcuts) (Settings, error) {
	if _, err := app.authorize(ctx, roleSettings); err != nil {
		return Settings{}, err
	}
	defer app.mu.Unlock()
	if app.configBusy || app.outputBusy {
		return Settings{}, errors.New("Please wait for the current operation.")
	}
	old := app.registered
	if err := replaceShortcuts(mygo.GlobalShortcut, old, next, startFull, startRegion); err != nil {
		return Settings{}, err
	}
	updated := app.settings
	updated.Shortcuts = next
	if err := persistSettings(app.configPath, updated); err != nil {
		restore := app.settings.Shortcuts
		if old != nil {
			restore = *old
		}
		_ = replaceShortcuts(mygo.GlobalShortcut, &next, restore, startFull, startRegion)
		return Settings{}, err
	}
	app.settings, app.registered, app.warning = updated, &next, ""
	return updated, nil
}

// Capture starts a capture of every display.
func (Screenshot) Capture(ctx context.Context, request CaptureRequest) error {
	if _, err := app.authorize(ctx, roleSettings); err != nil {
		return err
	}
	app.mu.Unlock()
	if request.Mode != CaptureFull && request.Mode != CaptureRegion {
		return errors.New("Invalid capture request.")
	}
	return app.beginCapture(request.Mode)
}

// Current returns the capture the calling window shows.
func (Screenshot) Current(ctx context.Context) (*CaptureData, error) {
	win, err := app.authorize(ctx, roleCapture)
	if err != nil {
		return nil, err
	}
	defer app.mu.Unlock()
	if overlay, ok := app.overlays[win]; ok {
		return &overlay, nil
	}
	return app.data, nil
}

// SelectionPhase is a step of selecting a region.
type SelectionPhase string

const (
	SelectionStart SelectionPhase = "start"
	SelectionEnd   SelectionPhase = "end"
	SelectionReset SelectionPhase = "reset"
)

// Selection starts, resets or ends the selection of a region; the cursor
// position is read here, so it spans displays.
func (Screenshot) Selection(ctx context.Context, id string, phase SelectionPhase) error {
	win, err := app.authorize(ctx, roleCapture)
	if err != nil {
		return err
	}
	defer app.mu.Unlock()
	if err := app.assertSession(id); err != nil {
		return err
	}
	if _, ok := app.overlays[win]; !ok || app.desktop == nil || app.data.Mode != CaptureRegion {
		return errors.New("Selection is not available.")
	}
	layout := *app.desktop
	cursor := func() Point { p := mygo.Screen.CursorScreenPoint(); return Point{X: p.X, Y: p.Y} }
	switch phase {
	case SelectionStart:
		if app.selectionOwner != nil {
			return errors.New("A selection is already active.")
		}
		start := cursor()
		stop := make(chan struct{})
		app.selectionOwner, app.selectionStart, app.selectionStop = win, &start, stop
		r := layout.region(start, start)
		app.broadcastSelection(&r)
		go func() {
			ticker := time.NewTicker(16 * time.Millisecond)
			defer ticker.Stop()
			for {
				select {
				case <-stop:
					return
				case <-ticker.C:
					r := layout.region(start, cursor())
					app.mu.Lock()
					if app.selectionStop == stop {
						app.broadcastSelection(&r)
					}
					app.mu.Unlock()
				}
			}
		}()
		return nil
	case SelectionReset, SelectionEnd:
		if app.selectionOwner != win || app.selectionStart == nil {
			return errors.New("No active selection in this window.")
		}
		r := layout.pixels(layout.region(*app.selectionStart, cursor()))
		app.resetSelection()
		app.broadcastSelection(nil)
		if phase == SelectionEnd && r.Width > 0 && r.Height > 0 {
			return app.finishCrop(id, r)
		}
		return nil
	}
	return errors.New("Invalid selection action.")
}

// ImportImage asks for an image file to insert into the capture.
func (Screenshot) ImportImage(ctx context.Context, id string) (*ImportedFile, error) {
	win, err := app.authorize(ctx, roleCapture)
	if err != nil {
		return nil, err
	}
	if err := app.assertSession(id); err != nil {
		app.mu.Unlock()
		return nil, err
	}
	if app.importBusy || app.outputBusy || app.data.Mode != CaptureFull {
		app.mu.Unlock()
		return nil, errors.New("Please wait for the current operation.")
	}
	app.importBusy = true
	app.mu.Unlock()
	defer func() { app.mu.Lock(); app.importBusy = false; app.mu.Unlock() }()
	pictures, _ := mygo.App.Path(mygo.PathPictures)
	paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{
		Parent: win, Title: "Insert image", DefaultPath: pictures,
		Filters: []mygo.FileFilter{{Name: "Images", Extensions: importExtensions}},
	})
	if err != nil || len(paths) == 0 {
		return nil, err
	}
	imported, err := readImportedImage(paths[0])
	if err != nil {
		return nil, err
	}
	app.mu.Lock()
	defer app.mu.Unlock()
	if err := app.assertSession(id); err != nil {
		return nil, err
	}
	return imported, nil
}

// Cancel ends the capture.
func (Screenshot) Cancel(ctx context.Context, id string) error {
	if _, err := app.authorize(ctx, roleCapture); err != nil {
		return err
	}
	defer app.mu.Unlock()
	if err := app.assertSession(id); err != nil {
		return err
	}
	if app.outputBusy {
		return errors.New("Please wait for export.")
	}
	app.clearCapture()
	return nil
}

// Crop selects a region of the desktop in composite pixels.
func (Screenshot) Crop(ctx context.Context, id string, r Rect) error {
	if _, err := app.authorize(ctx, roleCapture); err != nil {
		return err
	}
	defer app.mu.Unlock()
	return app.finishCrop(id, r)
}

// OutputAction is what to do with the annotated image.
type OutputAction string

const (
	OutputCopy OutputAction = "copy"
	OutputSave OutputAction = "save"
)

// OutputResult says what became of the image.
type OutputResult string

const (
	OutputCopied    OutputResult = "copied"
	OutputSaved     OutputResult = "saved"
	OutputCancelled OutputResult = "cancelled"
)

// Output copies the annotated PNG to the clipboard or saves it.
func (Screenshot) Output(ctx context.Context, id string, action OutputAction, png string) (OutputResult, error) {
	win, err := app.authorize(ctx, roleCapture)
	if err != nil {
		return "", err
	}
	if err := app.assertSession(id); err != nil {
		app.mu.Unlock()
		return "", err
	}
	if app.outputBusy || app.importBusy || app.configBusy || app.data.Mode != CaptureFull || (action != OutputCopy && action != OutputSave) {
		app.mu.Unlock()
		return "", errors.New("Export is not available.")
	}
	app.outputBusy = true
	width, height := app.data.Width, app.data.Height
	directory := ""
	if app.settings.LastDirectory != nil {
		directory = *app.settings.LastDirectory
	}
	app.mu.Unlock()
	defer func() { app.mu.Lock(); app.outputBusy = false; app.mu.Unlock() }()

	data, err := decodePng(png, width, height)
	if err != nil {
		return "", err
	}
	if action == OutputCopy {
		if err := mygo.Clipboard.WriteImage(data); err != nil {
			return "", err
		}
		return OutputCopied, nil
	}
	if directory == "" {
		directory, _ = mygo.App.Path(mygo.PathPictures)
	}
	name := "Screenshot-" + strings.NewReplacer(":", "-", ".", "-").Replace(time.Now().UTC().Format("2006-01-02T15:04:05.000Z")) + ".png"
	path, err := mygo.Dialog.Save(mygo.SaveDialogOptions{
		Parent: win, Title: "Save screenshot", DefaultPath: filepath.Join(directory, name), CreateDirectories: true,
		Filters: []mygo.FileFilter{{Name: "PNG image", Extensions: []string{"png"}}},
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return OutputCancelled, nil
	}
	app.mu.Lock()
	err = app.assertSession(id)
	app.mu.Unlock()
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", err
	}
	app.mu.Lock()
	defer app.mu.Unlock()
	dir := filepath.Dir(path)
	app.settings.LastDirectory = &dir
	if persistSettings(app.configPath, app.settings) != nil {
		app.warning = "Image saved, but the last folder could not be remembered."
	}
	return OutputSaved, nil
}

func main() {
	if dir := os.Getenv("SCREENSHOT_TEST_USER_DATA"); dir != "" {
		mygo.App.SetPath(mygo.PathUserData, dir)
	}
	mygo.Bind(Screenshot{})
	if !mygo.App.RequestSingleInstanceLock() {
		return
	}
	mygo.App.OnSecondInstance(func([]string, string) {
		go func() {
			app.mu.Lock()
			win := app.captureWindow
			app.mu.Unlock()
			if win != nil {
				win.Show()
				win.Focus()
			} else {
				app.showSettings()
			}
		}()
	})
	// The app lives in the tray when its windows close.
	mygo.App.OnWindowAllClosed(func() {})
	mygo.App.OnBeforeQuit(func(*mygo.QuitEvent) {
		quitting.Store(true)
		mygo.GlobalShortcut.UnregisterAll()
	})
	mygo.App.WhenReady(func() { go setup() })
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}

// setup runs once the app is ready, off the main thread.
func setup() {
	dir, err := mygo.App.Path(mygo.PathUserData)
	if err != nil {
		log.Fatal(err)
	}
	app.mu.Lock()
	app.configPath = filepath.Join(dir, "settings.json")
	app.settings, app.warning = loadSettings(app.configPath)
	if err := replaceShortcuts(mygo.GlobalShortcut, nil, app.settings.Shortcuts, startFull, startRegion); err != nil {
		app.warning = strings.TrimSpace(app.warning + " " + err.Error())
	} else {
		shortcuts := app.settings.Shortcuts
		app.registered = &shortcuts
	}
	tray, err := mygo.NewTray(mygo.TrayOptions{Icon: trayIcon, ToolTip: "Screenshot"})
	if err != nil {
		app.warning = strings.TrimSpace(fmt.Sprintf("%s Tray icon unavailable: %v", app.warning, err))
	}
	app.tray = tray
	app.refreshTray()
	app.mu.Unlock()
	mygo.Screen.OnDisplaysChanged(func() {
		go func() {
			app.mu.Lock()
			active := app.session != ""
			if active {
				app.clearCapture()
			}
			app.mu.Unlock()
			if active {
				report(errors.New("Display configuration changed. Please capture again."))
			}
		}()
	})
	app.showSettings()
}
