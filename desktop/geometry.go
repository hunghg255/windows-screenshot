package main

import (
	"errors"
	"math"
)

// Point is a position in screen DIPs or image pixels.
type Point struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// Rect is a position and size in screen DIPs or image pixels.
type Rect struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

// DesktopDisplay is one display of the virtual desktop.
type DesktopDisplay struct {
	ID          int64
	Bounds      Rect
	ScaleFactor float64
}

// DesktopLayout maps the virtual desktop, in DIPs, onto one image.
type DesktopLayout struct {
	Bounds   Rect
	Scale    float64
	Width    int
	Height   int
	Displays []DesktopDisplay
}

// Bound both the native composite and the editor's cached canvas surfaces.
const (
	maxDesktopPixels = 32_000_000
	maxDesktopEdge   = 16_384
)

func desktopLayout(displays []DesktopDisplay) (DesktopLayout, error) {
	if len(displays) == 0 {
		return DesktopLayout{}, errors.New("No connected displays.")
	}
	minX, minY, maxX, maxY, scale, total := math.MaxInt, math.MaxInt, math.MinInt, math.MinInt, 0.0, 0
	for _, d := range displays {
		b := d.Bounds
		if b.Width <= 0 || b.Height <= 0 || !(d.ScaleFactor > 0) || math.IsInf(d.ScaleFactor, 0) {
			return DesktopLayout{}, errors.New("Invalid display geometry.")
		}
		minX, minY = min(minX, b.X), min(minY, b.Y)
		maxX, maxY = max(maxX, b.X+b.Width), max(maxY, b.Y+b.Height)
		scale = max(scale, d.ScaleFactor)
		total += round(float64(b.Width)*d.ScaleFactor) * round(float64(b.Height)*d.ScaleFactor)
	}
	bounds := Rect{X: minX, Y: minY, Width: maxX - minX, Height: maxY - minY}
	width, height := round(float64(bounds.Width)*scale), round(float64(bounds.Height)*scale)
	if total > maxDesktopPixels || width > maxDesktopEdge || height > maxDesktopEdge || width*height > maxDesktopPixels {
		return DesktopLayout{}, errors.New("The combined desktop is too large (maximum 32 megapixels and 16384 pixels per edge). Reduce display resolution and try again.")
	}
	return DesktopLayout{Bounds: bounds, Scale: scale, Width: width, Height: height, Displays: displays}, nil
}

// pixels converts a DIP rectangle of the desktop to composite image pixels.
func (l DesktopLayout) pixels(r Rect) Rect {
	x, y := round(float64(r.X-l.Bounds.X)*l.Scale), round(float64(r.Y-l.Bounds.Y)*l.Scale)
	return Rect{X: x, Y: y, Width: round(float64(r.X+r.Width-l.Bounds.X)*l.Scale) - x, Height: round(float64(r.Y+r.Height-l.Bounds.Y)*l.Scale) - y}
}

// region is the rectangle between two DIP points, clamped to the desktop.
func (l DesktopLayout) region(start, end Point) Rect {
	b := l.Bounds
	clampX := func(x int) int { return max(b.X, min(b.X+b.Width, x)) }
	clampY := func(y int) int { return max(b.Y, min(b.Y+b.Height, y)) }
	x, y := clampX(min(start.X, end.X)), clampY(min(start.Y, end.Y))
	return Rect{X: x, Y: y, Width: clampX(max(start.X, end.X)) - x, Height: clampY(max(start.Y, end.Y)) - y}
}

func intersects(a, b Rect) bool {
	return min(a.X+a.Width, b.X+b.Width) > max(a.X, b.X) && min(a.Y+a.Height, b.Y+b.Height) > max(a.Y, b.Y)
}

func validRect(r Rect, width, height int) bool {
	return r.X >= 0 && r.Y >= 0 && r.Width > 0 && r.Height > 0 && r.X+r.Width <= width && r.Y+r.Height <= height
}

// round matches JavaScript's Math.round, which the renderer uses.
func round(v float64) int { return int(math.Floor(v + 0.5)) }
