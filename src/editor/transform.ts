import type { Point } from '../../shared/contracts';
import { arrowHead, type Annotation, type GlyphAnnotation, type Transform } from './model';
import { measureGlyph } from './glyph-layout';
import { validateImageSize } from '../../shared/image-import';
export type Box = { x: number; y: number; right: number; bottom: number };
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type DragHandle = Handle | 'move' | 'rotate';
export const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const identity: Transform = { x: 0, y: 0, sx: 1, sy: 1 };
export function transformBox(b: Box, t: Transform): Box { return { x: b.x * t.sx + t.x, y: b.y * t.sy + t.y, right: b.right * t.sx + t.x, bottom: b.bottom * t.sy + t.y }; }
export function transformPoint(p: Point, t: Transform): Point { return { x: p.x * t.sx + t.x, y: p.y * t.sy + t.y }; }
export function inversePoint(p: Point, t: Transform): Point { return { x: (p.x - t.x) / t.sx, y: (p.y - t.y) / t.sy }; }
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const canRotate = (a: Annotation) => a.type === 'image' || a.type === 'arrow' || a.type === 'rectangle' || a.type === 'text' || a.type === 'emoji';
export const normalizeAngle = (angle: number) => ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
export const rotationOf = (a: Annotation) => canRotate(a) ? a.rotation ?? 0 : 0;
export const boxCenter = (b: Box): Point => ({ x: (b.x + b.right) / 2, y: (b.y + b.bottom) / 2 });
export function rotatePoint(p: Point, center: Point, angle: number): Point {
  const x = p.x - center.x, y = p.y - center.y, cos = Math.cos(angle), sin = Math.sin(angle);
  return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
}
export function boxCorners(b: Box): Point[] { return [{ x: b.x, y: b.y }, { x: b.right, y: b.y }, { x: b.right, y: b.bottom }, { x: b.x, y: b.bottom }]; }
function pointBounds(points: Point[]): Box {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of points) { x = Math.min(x, p.x); y = Math.min(y, p.y); right = Math.max(right, p.x); bottom = Math.max(bottom, p.y); }
  return { x, y, right, bottom };
}
const paddedBox = (b: Box, padding: number): Box => ({ x: b.x - padding, y: b.y - padding, right: b.right + padding, bottom: b.bottom + padding });

// Unrotated ink bounds: scale is already applied, UI padding is excluded.
export function frameBounds(a: Annotation): Box {
  if (a.type === 'image') return { x: a.position.x, y: a.position.y, right: a.position.x + a.width, bottom: a.position.y + a.height };
  if (a.type === 'text' || a.type === 'emoji') {
    const b = measureGlyph(a).bounds;
    return { x: b.x + 2, y: b.y + 2, right: Math.max(b.right - 2, b.x + 4), bottom: b.bottom - 2 };
  }
  if (a.type === 'rectangle') {
    const t = a.transform ?? identity;
    return paddedBox(pointBounds([transformPoint(a.start, t), transformPoint(a.end, t)]), a.width / 2);
  }
  const points = 'points' in a ? a.points : a.type === 'arrow' ? [a.start, a.end, ...arrowHead(a.start, a.end, a.width)] : [a.start, a.end];
  const b = paddedBox(pointBounds(points.length ? points : [{ x: 0, y: 0 }]), a.width / 2);
  return a.transform ? transformBox(b, a.transform) : b;
}
export function orientedCorners(a: Annotation): Point[] {
  const b = frameBounds(a), center = boxCenter(b);
  return boxCorners(b).map(p => rotatePoint(p, center, rotationOf(a)));
}
export function annotationBounds(a: Annotation, padding = 2): Box {
  return paddedBox(rotationOf(a) ? pointBounds(orientedCorners(a)) : frameBounds(a), padding);
}
export function rotationFromPointer(original: number, center: Point, start: Point, current: Point, snap: boolean, previous = original): number {
  if (Math.hypot(current.x - center.x, current.y - center.y) < 2 || Math.hypot(start.x - center.x, start.y - center.y) < 2) return previous;
  let angle = original + Math.atan2(current.y - center.y, current.x - center.x) - Math.atan2(start.y - center.y, start.x - center.x);
  if (snap) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
  return normalizeAngle(angle);
}
export function translated<T extends Annotation>(a: T, dx: number, dy: number): T {
  if ('position' in a) return { ...a, position: { x: a.position.x + dx, y: a.position.y + dy } };
  const t = a.transform ?? identity; return { ...a, transform: { ...t, x: t.x + dx, y: t.y + dy } };
}
// Retain the world position of the glyph's placement point when its layout changes.
export function preserveGlyphOrigin<T extends GlyphAnnotation>(before: T, after: T): T {
  const angle = rotationOf(before); if (!angle) return after;
  const oldOrigin = rotatePoint(before.position, boxCenter(frameBounds(before)), angle);
  const newOrigin = rotatePoint(after.position, boxCenter(frameBounds(after)), angle);
  return translated(after, oldOrigin.x - newOrigin.x, oldOrigin.y - newOrigin.y);
}
export function moveAnnotation(a: Annotation, b: Box, delta: Point, image: { width: number; height: number }) {
  const insideX = b.x >= 0 && b.right <= image.width, insideY = b.y >= 0 && b.bottom <= image.height;
  return translated(a, clamp(delta.x, insideX ? -b.x : 2 - b.right, insideX ? image.width - b.right : image.width - 2 - b.x), clamp(delta.y, insideY ? -b.y : 2 - b.bottom, insideY ? image.height - b.bottom : image.height - 2 - b.y));
}
export function handlePoint(b: Box, handle: Handle, opposite = false): Point {
  const hx = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0, hy = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0;
  const direction = opposite ? -1 : 1, c = boxCenter(b);
  return { x: c.x + direction * hx * (b.right - b.x) / 2, y: c.y + direction * hy * (b.bottom - b.y) / 2 };
}
export function resizedBox(b: Box, handle: Handle, delta: Point, uniform: boolean, minimum = 2): Box {
  // A line-like rectangle needs a nonzero interaction box before it can grow.
  if (b.right - b.x < 2 || b.bottom - b.y < 2) b = { ...b, right: b.x + Math.max(2, b.right - b.x), bottom: b.y + Math.max(2, b.bottom - b.y) };
  const w = Math.max(2, b.right - b.x), h = Math.max(2, b.bottom - b.y);
  const hx = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0, hy = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0;
  let sx = hx ? Math.max(minimum / w, (w + hx * delta.x) / w) : 1, sy = hy ? Math.max(minimum / h, (h + hy * delta.y) / h) : 1;
  if (uniform) { const scale = hx && hy ? (Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy) : hx ? sx : sy; sx = sy = Math.max(minimum / w, minimum / h, scale); }
  const { x: ax, y: ay } = handlePoint(b, handle, true);
  return { x: ax + (b.x - ax) * sx, right: ax + (b.right - ax) * sx, y: ay + (b.y - ay) * sy, bottom: ay + (b.bottom - ay) * sy };
}
function resizeLocal(a: Annotation, b: Box, handle: Handle, delta: Point, aspect: boolean): Annotation {
  const glyph = a.type === 'text' || a.type === 'emoji', uniform = glyph || (aspect && handle.length === 2);
  const next = a.type === 'rectangle'
    ? paddedBox(resizedBox(paddedBox(b, -a.width / 2), handle, delta, uniform), a.width / 2)
    : resizedBox(b, handle, delta, uniform);
  let sx = (next.right - next.x) / (b.right - b.x), sy = (next.bottom - next.y) / (b.bottom - b.y);
  let updated: Annotation;
  if (a.type === 'image') {
    updated = { ...a, width: a.width * sx, height: a.height * sy };
  } else if (glyph) {
    updated = a.type === 'text' ? { ...a, fontSize: clamp(a.fontSize * sx, 12, 160) } : { ...a, size: clamp(a.size * sx, 16, 256) };
  } else {
    const t = a.transform ?? identity;
    updated = a;
    if (a.type === 'rectangle') {
      // Stroke stays in image pixels, so only the centerline dimensions scale.
      const oldWidth = b.right - b.x - a.width, oldHeight = b.bottom - b.y - a.width;
      const newWidth = next.right - next.x - a.width, newHeight = next.bottom - next.y - a.width;
      sx = oldWidth > 1e-8 ? newWidth / oldWidth : 1;
      sy = oldHeight > 1e-8 ? newHeight / oldHeight : 1;
      updated = { ...a, end: { x: oldWidth > 1e-8 ? a.end.x : a.start.x + newWidth / t.sx, y: oldHeight > 1e-8 ? a.end.y : a.start.y + newHeight / t.sy } };
    }
    updated = { ...updated, transform: { ...t, sx: t.sx * sx, sy: t.sy * sy } };
  }
  const angle = rotationOf(a), newBounds = frameBounds(updated);
  const oldAnchor = rotatePoint(handlePoint(b, handle, true), boxCenter(b), angle);
  const newAnchor = rotatePoint(handlePoint(newBounds, handle, true), boxCenter(newBounds), angle);
  return translated(updated, oldAnchor.x - newAnchor.x, oldAnchor.y - newAnchor.y);
}
export function resizeAnnotation(a: Annotation, _bounds: Box, handle: Handle, delta: Point, aspect: boolean, image: { width: number; height: number }): Annotation {
  if (!delta.x && !delta.y) return a;
  const b = frameBounds(a), world = annotationBounds(a, 0), localDelta = rotatePoint(delta, { x: 0, y: 0 }, -rotationOf(a));
  const insideX = world.x >= -1e-7 && world.right <= image.width + 1e-7, insideY = world.y >= -1e-7 && world.bottom <= image.height + 1e-7;
  if (!rotationOf(a) && !('position' in a) && !(aspect && handle.length === 2)) {
    // Preserve independent axis clamping for the existing unrotated corner gesture.
    if (insideX) { if (handle.includes('w')) localDelta.x = Math.max(-world.x, localDelta.x); if (handle.includes('e')) localDelta.x = Math.min(image.width - world.right, localDelta.x); }
    if (insideY) { if (handle.includes('n')) localDelta.y = Math.max(-world.y, localDelta.y); if (handle.includes('s')) localDelta.y = Math.min(image.height - world.bottom, localDelta.y); }
  }
  const fits = (candidate: Annotation) => {
    if (candidate.type === 'image') { try { validateImageSize(candidate.width, candidate.height); } catch { return false; } }
    const bounds = annotationBounds(candidate, 0);
    return (!insideX || (bounds.x >= -1e-7 && bounds.right <= image.width + 1e-7)) && (!insideY || (bounds.y >= -1e-7 && bounds.bottom <= image.height + 1e-7));
  };
  const candidate = resizeLocal(a, b, handle, localDelta, aspect);
  if (fits(candidate)) return candidate;
  // Along the drag ray, find the last valid size without shifting the fixed world anchor.
  let lo = 0, hi = 1, result = a;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2, next = resizeLocal(a, b, handle, { x: localDelta.x * mid, y: localDelta.y * mid }, aspect);
    if (fits(next)) { lo = mid; result = next; } else hi = mid;
  }
  return result;
}
