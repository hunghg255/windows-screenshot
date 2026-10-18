import type { Rect } from './contracts';
import { validRegion } from './recording-contracts';
// Region is display-local DIP. Ratios also account for capture-source downscaling.
export function recordingCrop(region: Rect, bounds: Rect, frameWidth: number, frameHeight: number): Rect {
  if (!validRegion(region) || ![bounds.width,bounds.height,frameWidth,frameHeight].every(n => Number.isFinite(n) && n > 0) ||
      region.x + region.width > bounds.width + .01 || region.y + region.height > bounds.height + .01) throw new Error('Invalid recording region.');
  const even = (n: number) => Math.floor(n / 2) * 2;
  const x = even(region.x / bounds.width * frameWidth), y = even(region.y / bounds.height * frameHeight);
  const right = Math.min(even(frameWidth), even((region.x + region.width) / bounds.width * frameWidth));
  const bottom = Math.min(even(frameHeight), even((region.y + region.height) / bounds.height * frameHeight));
  if (right - x < 2 || bottom - y < 2) throw new Error('Recording region is too small.');
  return { x, y, width: right - x, height: bottom - y };
}
export function recordingSize(width: number, height: number) {
  const scale = Math.min(1, 1920 / width, 1080 / height);
  return { width: Math.max(2, Math.floor(width * scale / 2) * 2), height: Math.max(2, Math.floor(height * scale / 2) * 2) };
}
