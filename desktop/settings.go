package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

// Shortcuts are the global shortcuts that start a capture.
type Shortcuts struct {
	Full   string `json:"full"`
	Region string `json:"region"`
}

// Settings are kept in settings.json in the user data directory.
type Settings struct {
	Shortcuts     Shortcuts `json:"shortcuts"`
	LastDirectory *string   `json:"lastDirectory,omitempty"`
}

var defaultShortcuts = Shortcuts{Full: "Ctrl+Alt+F", Region: "Ctrl+Alt+R"}

var shortcutPattern = regexp.MustCompile(`^(?:(?:Ctrl|Alt|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|PrintScreen)$`)

func validShortcut(v string) bool {
	parts := strings.Split(v, "+")
	return shortcutPattern.MatchString(v) && len(slices.Compact(slices.Sorted(slices.Values(parts)))) == len(parts)
}

func canonicalShortcut(v string) string {
	return strings.Join(slices.Sorted(slices.Values(strings.Split(v, "+"))), "+")
}

func validateShortcuts(s Shortcuts) bool {
	return validShortcut(s.Full) && validShortcut(s.Region) && canonicalShortcut(s.Full) != canonicalShortcut(s.Region)
}

func loadSettings(path string) (Settings, string) {
	fallback := Settings{Shortcuts: defaultShortcuts}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return fallback, ""
	}
	var s Settings
	if err != nil || json.Unmarshal(data, &s) != nil || !validateShortcuts(s.Shortcuts) {
		return fallback, "Configuration was unreadable. Default shortcuts restored."
	}
	return s, ""
}

func persistSettings(path string, s Settings) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(path+".new", data, 0o644); err != nil {
		return err
	}
	return os.Rename(path+".new", path)
}

// Registry registers global shortcuts, mygo.GlobalShortcut in the app.
type Registry interface {
	Register(accelerator string, fn func()) error
	Unregister(accelerator string)
}

type binding struct {
	key string
	fn  func()
}

// replaceShortcuts swaps old for next, restoring old when next cannot be
// registered completely.
func replaceShortcuts(registry Registry, old *Shortcuts, next Shortcuts, full, region func()) error {
	if !validateShortcuts(next) {
		return errors.New("Use two different shortcuts with a modifier and a letter, number or function key.")
	}
	bindings := func(s Shortcuts) []binding { return []binding{{s.Full, full}, {s.Region, region}} }
	if old != nil {
		registry.Unregister(old.Full)
		registry.Unregister(old.Region)
	}
	var added []string
	for _, b := range bindings(next) {
		if err := registry.Register(b.key, b.fn); err != nil {
			for _, key := range added {
				registry.Unregister(key)
			}
			var lost []string
			if old != nil {
				for _, b := range bindings(*old) {
					if registry.Register(b.key, b.fn) != nil {
						lost = append(lost, b.key)
					}
				}
			}
			if len(lost) > 0 {
				return fmt.Errorf("Could not restore %s. Open Settings and choose available shortcuts.", strings.Join(lost, ", "))
			}
			return fmt.Errorf("Shortcut %s is already in use.", b.key)
		}
		added = append(added, b.key)
	}
	return nil
}
