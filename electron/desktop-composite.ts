import { nativeImage, type NativeImage } from 'electron';
import { desktopPixels, type DesktopLayout } from '../shared/desktop-geometry';

export function compositeDesktop(layout: DesktopLayout, frames: NativeImage[]): NativeImage {
  if (frames.length !== layout.displays.length) throw new Error('Missing display frame.');
  if (frames.length === 1) return frames[0];
  const bytes = Buffer.alloc(layout.width * layout.height * 4);
  layout.displays.forEach((display, index) => {
    const r = desktopPixels(display.bounds, layout);
    const frame = frames[index].resize({ width: r.width, height: r.height, quality: 'best' }).toBitmap();
    if (frame.length !== r.width * r.height * 4) throw new Error('Invalid display bitmap.');
    for (let row = 0; row < r.height; row++) frame.copy(bytes, ((r.y + row) * layout.width + r.x) * 4, row * r.width * 4, (row + 1) * r.width * 4);
  });
  return nativeImage.createFromBitmap(bytes, { width: layout.width, height: layout.height, scaleFactor: 1 });
}
