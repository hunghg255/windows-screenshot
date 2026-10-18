package main

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"golang.org/x/image/draw"
)

func compositeDesktop(layout DesktopLayout, frames []*image.RGBA) (*image.RGBA, error) {
	if len(frames) != len(layout.Displays) {
		return nil, errors.New("Missing display frame.")
	}
	if len(frames) == 1 {
		return frames[0], nil
	}
	out := image.NewRGBA(image.Rect(0, 0, layout.Width, layout.Height))
	for i, d := range layout.Displays {
		r := layout.pixels(d.Bounds)
		target := image.Rect(r.X, r.Y, r.X+r.Width, r.Y+r.Height)
		if frames[i].Bounds().Size() == target.Size() {
			draw.Copy(out, target.Min, frames[i], frames[i].Bounds(), draw.Src, nil)
		} else {
			draw.CatmullRom.Scale(out, target, frames[i], frames[i].Bounds(), draw.Src, nil)
		}
	}
	return out, nil
}

func pngDataURL(img image.Image) (string, error) {
	var buf bytes.Buffer
	if err := (&png.Encoder{CompressionLevel: png.BestSpeed}).Encode(&buf, img); err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

// decodePng checks an exported PNG data URL and returns its bytes. The
// image may be rotated a quarter turn, which swaps its dimensions.
func decodePng(value string, width, height int) ([]byte, error) {
	const prefix = "data:image/png;base64,"
	if len(value) > 180_000_000 || !strings.HasPrefix(value, prefix) {
		return nil, errors.New("Invalid PNG payload.")
	}
	data, err := base64.StdEncoding.DecodeString(value[len(prefix):])
	if err != nil {
		return nil, errors.New("Invalid PNG payload.")
	}
	if len(data) < 33 || !bytes.Equal(data[:8], []byte("\x89PNG\r\n\x1a\n")) || string(data[12:16]) != "IHDR" {
		return nil, errors.New("PNG dimensions do not match this capture.")
	}
	w, h := int(binary.BigEndian.Uint32(data[16:20])), int(binary.BigEndian.Uint32(data[20:24]))
	if !(w == width && h == height) && !(w == height && h == width) {
		return nil, errors.New("PNG dimensions do not match this capture.")
	}
	if _, err := png.DecodeConfig(bytes.NewReader(data)); err != nil {
		return nil, errors.New("Unable to decode PNG.")
	}
	return data, nil
}

const imageByteLimit = 20 * 1024 * 1024

// ImportedFile is an image file the user chose to insert. The renderer
// inspects its contents before loading it.
type ImportedFile struct {
	Bytes     []byte `json:"bytes"`
	Extension string `json:"extension"`
}

var importExtensions = []string{"png", "jpg", "jpeg", "svg", "webp"}

func readImportedImage(path string) (*ImportedFile, error) {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))
	if !slices.Contains(importExtensions, ext) {
		return nil, errors.New("Choose a valid PNG, JPG, JPEG, SVG or WebP image.")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if !stat.Mode().IsRegular() || stat.Size() <= 0 || stat.Size() > imageByteLimit {
		return nil, errors.New("Choose an image smaller than 20 MiB.")
	}
	// One extra byte tells a file that grew since Stat.
	data := make([]byte, stat.Size()+1)
	total := 0
	for total < len(data) {
		n, err := file.Read(data[total:])
		total += n
		if err != nil || n == 0 {
			break
		}
	}
	if int64(total) != stat.Size() {
		return nil, errors.New("The image changed while opening. Please try again.")
	}
	return &ImportedFile{Bytes: data[:total], Extension: ext}, nil
}
