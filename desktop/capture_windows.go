package main

import (
	"errors"
	"image"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	user32                 = windows.NewLazySystemDLL("user32.dll")
	gdi32                  = windows.NewLazySystemDLL("gdi32.dll")
	procGetMonitorInfoW    = user32.NewProc("GetMonitorInfoW")
	procGetDC              = user32.NewProc("GetDC")
	procReleaseDC          = user32.NewProc("ReleaseDC")
	procCreateCompatibleDC = gdi32.NewProc("CreateCompatibleDC")
	procCreateDIBSection   = gdi32.NewProc("CreateDIBSection")
	procSelectObject       = gdi32.NewProc("SelectObject")
	procBitBlt             = gdi32.NewProc("BitBlt")
	procDeleteObject       = gdi32.NewProc("DeleteObject")
	procDeleteDC           = gdi32.NewProc("DeleteDC")
)

const (
	srcCopy    = 0x00CC0020
	captureBlt = 0x40000000
)

type monitorInfo struct {
	Size    uint32
	Monitor windows.Rect
	Work    windows.Rect
	Flags   uint32
}

type bitmapInfoHeader struct {
	Size          uint32
	Width         int32
	Height        int32
	Planes        uint16
	BitCount      uint16
	Compression   uint32
	SizeImage     uint32
	XPelsPerMeter int32
	YPelsPerMeter int32
	ClrUsed       uint32
	ClrImportant  uint32
}

// captureDisplay copies one monitor at its physical resolution. MyGo makes
// the process per-monitor DPI aware, so monitor rectangles are in pixels.
// The display's ID is its HMONITOR.
func captureDisplay(d DesktopDisplay) (*image.RGBA, error) {
	info := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
	if r, _, _ := procGetMonitorInfoW.Call(uintptr(d.ID), uintptr(unsafe.Pointer(&info))); r == 0 {
		return nil, errors.New("The selected display is no longer available.")
	}
	m := info.Monitor
	width, height := int(m.Right-m.Left), int(m.Bottom-m.Top)
	if width <= 0 || height <= 0 {
		return nil, errors.New("The selected display is no longer available.")
	}
	screen, _, _ := procGetDC.Call(0)
	if screen == 0 {
		return nil, errors.New("Screen capture is not available.")
	}
	defer procReleaseDC.Call(0, screen)
	memory, _, _ := procCreateCompatibleDC.Call(screen)
	if memory == 0 {
		return nil, errors.New("Screen capture is not available.")
	}
	defer procDeleteDC.Call(memory)
	// A negative height makes the bitmap top-down, like image.RGBA.
	header := bitmapInfoHeader{Size: uint32(unsafe.Sizeof(bitmapInfoHeader{})), Width: int32(width), Height: -int32(height), Planes: 1, BitCount: 32}
	var bits unsafe.Pointer
	bitmap, _, _ := procCreateDIBSection.Call(memory, uintptr(unsafe.Pointer(&header)), 0, uintptr(unsafe.Pointer(&bits)), 0, 0)
	if bitmap == 0 || bits == nil {
		return nil, errors.New("Not enough memory to capture the display.")
	}
	defer procDeleteObject.Call(bitmap)
	old, _, _ := procSelectObject.Call(memory, bitmap)
	defer procSelectObject.Call(memory, old)
	if r, _, _ := procBitBlt.Call(memory, 0, 0, uintptr(width), uintptr(height), screen, uintptr(m.Left), uintptr(m.Top), srcCopy|captureBlt); r == 0 {
		return nil, errors.New("The display did not provide a full-resolution frame.")
	}
	bgra := unsafe.Slice((*byte)(bits), width*height*4)
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for i := 0; i < len(bgra); i += 4 {
		img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3] = bgra[i+2], bgra[i+1], bgra[i], 255
	}
	return img, nil
}
