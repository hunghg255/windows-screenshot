import type { Point, Rect } from './contracts';
export const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
export function pixelPoint(p: Point, bounds: Rect, image: { width: number; height: number }): Point {
  return { x: clamp((p.x - bounds.x) * image.width / bounds.width, image.width), y: clamp((p.y - bounds.y) * image.height / bounds.height, image.height) };
}
export function region(a: Point, b: Point, size: { width: number; height: number }): Rect {
  const x = Math.floor(clamp(Math.min(a.x, b.x), size.width));
  const y = Math.floor(clamp(Math.min(a.y, b.y), size.height));
  return { x, y, width: Math.ceil(clamp(Math.max(a.x, b.x), size.width)) - x, height: Math.ceil(clamp(Math.max(a.y, b.y), size.height)) - y };
}
export function validRect(value: unknown, width: number, height: number): value is Rect {
  if (!value || typeof value !== 'object') return false;
  const r = value as Rect;
  return [r.x, r.y, r.width, r.height].every(Number.isInteger) && r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x + r.width <= width && r.y + r.height <= height;
}
