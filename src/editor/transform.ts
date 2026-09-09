import type { Point } from '../../shared/contracts';
import type { Annotation, Transform } from './model';
import { measureGlyph } from './glyph-layout';
export type Box = { x: number; y: number; right: number; bottom: number };
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const identity: Transform = { x: 0, y: 0, sx: 1, sy: 1 };
export function transformBox(b: Box, t: Transform): Box { return { x: b.x * t.sx + t.x, y: b.y * t.sy + t.y, right: b.right * t.sx + t.x, bottom: b.bottom * t.sy + t.y }; }
export function inversePoint(p: Point, t: Transform): Point { return { x: (p.x - t.x) / t.sx, y: (p.y - t.y) / t.sy }; }
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export function translated(a: Annotation, dx: number, dy: number): Annotation {
  if ('position' in a) return { ...a, position: { x: a.position.x + dx, y: a.position.y + dy } };
  const t = a.transform ?? identity; return { ...a, transform: { ...t, x: t.x + dx, y: t.y + dy } };
}
export function moveAnnotation(a: Annotation, b: Box, delta: Point, image: { width: number; height: number }) {
  const insideX = b.x >= 0 && b.right <= image.width, insideY = b.y >= 0 && b.bottom <= image.height;
  return translated(a, clamp(delta.x, insideX ? -b.x : 2 - b.right, insideX ? image.width - b.right : image.width - 2 - b.x), clamp(delta.y, insideY ? -b.y : 2 - b.bottom, insideY ? image.height - b.bottom : image.height - 2 - b.y));
}
export function resizedBox(b: Box, handle: Handle, delta: Point, uniform: boolean): Box {
  const w = Math.max(2, b.right - b.x), h = Math.max(2, b.bottom - b.y);
  const hx = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0, hy = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0;
  let sx = hx ? Math.max(2 / w, (w + hx * delta.x) / w) : 1, sy = hy ? Math.max(2 / h, (h + hy * delta.y) / h) : 1;
  if (uniform) { const scale = hx && hy ? (Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy) : hx ? sx : sy; sx = sy = Math.max(2 / w, 2 / h, scale); }
  const ax = hx < 0 ? b.right : hx > 0 ? b.x : (b.x + b.right) / 2, ay = hy < 0 ? b.bottom : hy > 0 ? b.y : (b.y + b.bottom) / 2;
  return { x: ax + (b.x - ax) * sx, right: ax + (b.right - ax) * sx, y: ay + (b.y - ay) * sy, bottom: ay + (b.bottom - ay) * sy };
}
export function resizeAnnotation(a: Annotation, b: Box, handle: Handle, delta: Point, aspect: boolean, image: { width: number; height: number }): Annotation {
  const glyph = 'position' in a;
  const next = resizedBox(b, handle, delta, glyph || (aspect && handle.length === 2));
  let sx = (next.right - next.x) / (b.right - b.x), sy = (next.bottom - next.y) / (b.bottom - b.y);
  const ax = handle.includes('w') ? b.right : handle.includes('e') ? b.x : (b.x + b.right) / 2;
  const ay = handle.includes('n') ? b.bottom : handle.includes('s') ? b.y : (b.y + b.bottom) / 2;
  // Limit expansion about the fixed anchor only when the original fits that axis.
  const limit = (lo: number, hi: number, anchor: number, extent: number) => lo >= 0 && hi <= extent ? Math.min(lo < anchor ? anchor / (anchor - lo) : Infinity, hi > anchor ? (extent - anchor) / (hi - anchor) : Infinity) : Infinity;
  sx = Math.min(sx, limit(b.x, b.right, ax, image.width)); sy = Math.min(sy, limit(b.y, b.bottom, ay, image.height));
  if (glyph || (aspect && handle.length === 2)) sx = sy = Math.min(sx, sy);
  if (glyph) {
    const size = a.type === 'text' ? a.fontSize : a.size;
    const updated = a.type === 'text' ? { ...a, fontSize: clamp(size * sx, 12, 160) } : { ...a, size: clamp(size * sx, 16, 256) };
    const padded = measureGlyph(updated).bounds;
    const measured = { x: padded.x + 2, y: padded.y + 2, right: padded.right - 2, bottom: padded.bottom - 2 };
    const newAx = handle.includes('w') ? measured.right : handle.includes('e') ? measured.x : (measured.x + measured.right) / 2;
    const newAy = handle.includes('n') ? measured.bottom : handle.includes('s') ? measured.y : (measured.y + measured.bottom) / 2;
    return translated(updated, ax - newAx, ay - newAy);
  }
  const t = a.transform ?? identity;
  return { ...a, transform: { x: ax + (t.x - ax) * sx, y: ay + (t.y - ay) * sy, sx: t.sx * sx, sy: t.sy * sy } };
}
