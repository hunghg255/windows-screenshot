package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"maps"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
)

var displays = []DesktopDisplay{
	{ID: 1, Bounds: Rect{X: -100, Y: 0, Width: 100, Height: 80}, ScaleFactor: 1},
	{ID: 2, Bounds: Rect{X: 0, Y: -20, Width: 100, Height: 100}, ScaleFactor: 1.5},
	{ID: 3, Bounds: Rect{X: 100, Y: 0, Width: 60, Height: 120}, ScaleFactor: 2},
}

func TestLayoutMapsScaledScreensNegativeOriginsAndSharedEdges(t *testing.T) {
	layout, err := desktopLayout(displays)
	if err != nil {
		t.Fatal(err)
	}
	if layout.Bounds != (Rect{X: -100, Y: -20, Width: 260, Height: 140}) || layout.Scale != 2 || layout.Width != 520 || layout.Height != 280 {
		t.Fatalf("layout = %+v", layout)
	}
	if got := layout.pixels(displays[0].Bounds); got != (Rect{X: 0, Y: 40, Width: 200, Height: 160}) {
		t.Fatalf("pixels = %+v", got)
	}
	region := layout.region(Point{X: 150, Y: 90}, Point{X: -80, Y: 10})
	if got := layout.pixels(region); got != (Rect{X: 40, Y: 60, Width: 460, Height: 160}) {
		t.Fatalf("region pixels = %+v", got)
	}
	if layout.region(Point{X: -80, Y: 10}, Point{X: 150, Y: 90}) != region {
		t.Fatal("region depends on drag direction")
	}
	for _, d := range displays {
		if intersects(Rect{X: -90, Y: -19, Width: 20, Height: 10}, d.Bounds) {
			t.Fatalf("gap intersects display %d", d.ID)
		}
	}
}

func TestLayoutKeepsFractionalEdgesContiguous(t *testing.T) {
	ds := slices.Clone(displays[:2])
	for i := range ds {
		ds[i].ScaleFactor = 1.25
	}
	layout, _ := desktopLayout(ds)
	a, b := layout.pixels(ds[0].Bounds), layout.pixels(ds[1].Bounds)
	if a.X+a.Width != b.X {
		t.Fatalf("edges %+v %+v", a, b)
	}
	single, _ := desktopLayout(ds[:1])
	if single.Width != 125 || single.Height != 100 {
		t.Fatalf("single = %dx%d", single.Width, single.Height)
	}
}

func TestLayoutRejectsMissingInvalidAndOversizedDesktops(t *testing.T) {
	if _, err := desktopLayout(nil); err == nil {
		t.Fatal("accepted no displays")
	}
	for _, width := range []int{0, 20000} {
		if _, err := desktopLayout([]DesktopDisplay{{Bounds: Rect{Width: width, Height: 2000}, ScaleFactor: 1}}); err == nil {
			t.Fatalf("accepted width %d", width)
		}
	}
	if _, err := desktopLayout([]DesktopDisplay{{Bounds: Rect{Width: 10, Height: 10}, ScaleFactor: math.Inf(1)}}); err == nil {
		t.Fatal("accepted infinite scale")
	}
}

func TestCompositePlacesEachDisplay(t *testing.T) {
	ds := []DesktopDisplay{{Bounds: Rect{X: 0, Y: 0, Width: 2, Height: 1}, ScaleFactor: 1}, {Bounds: Rect{X: 2, Y: 0, Width: 1, Height: 1}, ScaleFactor: 1}}
	layout, _ := desktopLayout(ds)
	left, right := image.NewRGBA(image.Rect(0, 0, 2, 1)), image.NewRGBA(image.Rect(0, 0, 1, 1))
	copy(left.Pix, []byte{1, 1, 1, 255, 2, 2, 2, 255})
	copy(right.Pix, []byte{3, 3, 3, 255})
	out, err := compositeDesktop(layout, []*image.RGBA{left, right})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(out.Pix, []byte{1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255}) {
		t.Fatalf("pix = %v", out.Pix)
	}
	if _, err := compositeDesktop(layout, []*image.RGBA{left}); err == nil {
		t.Fatal("accepted a missing frame")
	}
}

func pngURL(t *testing.T, w, h int) string {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, w, h))); err != nil {
		t.Fatal(err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
}

func TestDecodePngAcceptsOnlyOriginalOrSwappedDimensions(t *testing.T) {
	for _, size := range [][2]int{{320, 180}, {180, 320}} {
		if _, err := decodePng(pngURL(t, size[0], size[1]), 320, 180); err != nil {
			t.Fatalf("%v: %v", size, err)
		}
	}
	for _, size := range [][2]int{{320, 320}, {180, 180}, {319, 180}, {640, 360}} {
		if _, err := decodePng(pngURL(t, size[0], size[1]), 320, 180); err == nil || !strings.Contains(err.Error(), "dimensions") {
			t.Fatalf("%v: %v", size, err)
		}
	}
	for _, payload := range []string{"data:image/jpeg;base64,abc", "data:image/png;base64,aaaa", "data:image/png;base64,!"} {
		if _, err := decodePng(payload, 1, 1); err == nil {
			t.Fatalf("accepted %q", payload)
		}
	}
}

func TestShortcutValidation(t *testing.T) {
	for _, s := range []Shortcuts{{"Ctrl+Alt+F", "Alt+Ctrl+F"}, {"F", "Ctrl+R"}, {"Ctrl+Ctrl+F", "Ctrl+R"}} {
		if validateShortcuts(s) {
			t.Fatalf("accepted %+v", s)
		}
	}
	if !validateShortcuts(defaultShortcuts) || !validateShortcuts(Shortcuts{"Ctrl+Shift+PrintScreen", "Super+F12"}) {
		t.Fatal("rejected valid shortcuts")
	}
}

type fakeRegistry struct {
	keys  map[string]bool
	taken string
}

func (r *fakeRegistry) Register(key string, _ func()) error {
	if key == r.taken || r.keys[key] {
		return errors.New("taken")
	}
	r.keys[key] = true
	return nil
}

func (r *fakeRegistry) Unregister(key string) { delete(r.keys, key) }

func (r *fakeRegistry) list() []string { return slices.Sorted(maps.Keys(r.keys)) }

func TestReplaceShortcutsRestoresOldOnConflict(t *testing.T) {
	r := &fakeRegistry{keys: map[string]bool{defaultShortcuts.Full: true, defaultShortcuts.Region: true}, taken: "Alt+X"}
	err := replaceShortcuts(r, &defaultShortcuts, Shortcuts{"Ctrl+J", "Alt+X"}, func() {}, func() {})
	if err == nil || !strings.Contains(err.Error(), "already in use") {
		t.Fatalf("err = %v", err)
	}
	if want := []string{defaultShortcuts.Full, defaultShortcuts.Region}; !reflect.DeepEqual(r.list(), want) {
		t.Fatalf("registered %v, want %v", r.list(), want)
	}
}

func TestReplaceShortcutsAllowsSwapping(t *testing.T) {
	r := &fakeRegistry{keys: map[string]bool{defaultShortcuts.Full: true, defaultShortcuts.Region: true}}
	if err := replaceShortcuts(r, &defaultShortcuts, Shortcuts{defaultShortcuts.Region, defaultShortcuts.Full}, func() {}, func() {}); err != nil {
		t.Fatal(err)
	}
	if len(r.keys) != 2 {
		t.Fatalf("registered %v", r.list())
	}
}

func TestSettingsFallBackAndPersistUnicodeFolders(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	if _, warning := loadSettings(path); warning != "" {
		t.Fatalf("warning for missing file: %q", warning)
	}
	if err := os.WriteFile(path, []byte("{broken"), 0o644); err != nil {
		t.Fatal(err)
	}
	if s, warning := loadSettings(path); !strings.Contains(warning, "unreadable") || s.Shortcuts != defaultShortcuts {
		t.Fatalf("corrupt file: %+v %q", s, warning)
	}
	dir := `D:\Ảnh chụp`
	settings := Settings{Shortcuts: Shortcuts{"Ctrl+J", "Ctrl+K"}, LastDirectory: &dir}
	if err := persistSettings(path, settings); err != nil {
		t.Fatal(err)
	}
	if got, warning := loadSettings(path); warning != "" || !reflect.DeepEqual(got, settings) {
		t.Fatalf("reloaded %+v %q", got, warning)
	}
	data, _ := os.ReadFile(path)
	var raw map[string]any
	if json.Unmarshal(data, &raw) != nil || raw["lastDirectory"] != dir {
		t.Fatalf("file = %s", data)
	}
}

func TestReadImportedImageChecksExtensionAndSize(t *testing.T) {
	dir := t.TempDir()
	good := filepath.Join(dir, "a.PNG")
	os.WriteFile(good, []byte("png bytes"), 0o644)
	if f, err := readImportedImage(good); err != nil || f.Extension != "png" || string(f.Bytes) != "png bytes" {
		t.Fatalf("%+v %v", f, err)
	}
	for name, size := range map[string]int{"a.gif": 4, "empty.png": 0, "big.png": imageByteLimit + 1} {
		path := filepath.Join(dir, name)
		os.WriteFile(path, make([]byte, size), 0o644)
		if _, err := readImportedImage(path); err == nil {
			t.Fatalf("accepted %s", name)
		}
	}
}
