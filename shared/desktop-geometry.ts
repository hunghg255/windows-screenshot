import type { Point, Rect } from './contracts';

export type DesktopDisplay = { id: number; bounds: Rect; scaleFactor: number };
// Bound both the native composite and the editor's cached canvas surfaces.
export const MAX_DESKTOP_PIXELS = 32_000_000;
export const MAX_DESKTOP_EDGE = 16_384;
export function desktopLayout(displays: DesktopDisplay[]) {
  if (!displays.length) throw new Error('No connected displays.');
  for (const d of displays) {
    if (![d.bounds.x, d.bounds.y, d.bounds.width, d.bounds.height, d.scaleFactor].every(Number.isFinite) || d.bounds.width <= 0 || d.bounds.height <= 0 || d.scaleFactor <= 0) throw new Error('Invalid display geometry.');
  }
  const x = Math.min(...displays.map(d => d.bounds.x)), y = Math.min(...displays.map(d => d.bounds.y));
  const bounds = { x, y, width: Math.max(...displays.map(d => d.bounds.x + d.bounds.width)) - x, height: Math.max(...displays.map(d => d.bounds.y + d.bounds.height)) - y };
  const scale = Math.max(...displays.map(d => d.scaleFactor));
  const width = Math.round(bounds.width * scale), height = Math.round(bounds.height * scale);
  if (displays.reduce((sum, d) => sum + Math.round(d.bounds.width * d.scaleFactor) * Math.round(d.bounds.height * d.scaleFactor), 0) > MAX_DESKTOP_PIXELS || width > MAX_DESKTOP_EDGE || height > MAX_DESKTOP_EDGE || width * height > MAX_DESKTOP_PIXELS) throw new Error('The combined desktop is too large (maximum 32 megapixels and 16384 pixels per edge). Reduce display resolution and try again.');
  return { bounds, scale, width, height, displays };
}
export type DesktopLayout = ReturnType<typeof desktopLayout>;
export function desktopPixels(rect: Rect, layout: DesktopLayout): Rect {
  const x = Math.round((rect.x - layout.bounds.x) * layout.scale), y = Math.round((rect.y - layout.bounds.y) * layout.scale);
  return { x, y, width: Math.round((rect.x + rect.width - layout.bounds.x) * layout.scale) - x, height: Math.round((rect.y + rect.height - layout.bounds.y) * layout.scale) - y };
}
export function desktopRegion(start: Point, end: Point, layout: DesktopLayout): Rect {
  const b = layout.bounds, clampX = (x: number) => Math.max(b.x, Math.min(b.x + b.width, x)), clampY = (y: number) => Math.max(b.y, Math.min(b.y + b.height, y));
  const x = clampX(Math.min(start.x, end.x)), y = clampY(Math.min(start.y, end.y));
  return { x, y, width: clampX(Math.max(start.x, end.x)) - x, height: clampY(Math.max(start.y, end.y)) - y };
}
export function intersects(a: Rect, b: Rect) { return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y); }
