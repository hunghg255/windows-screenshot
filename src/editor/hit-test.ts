import type { Point } from '../../shared/contracts';
import type { Annotation } from './model';
import { measureGlyph } from './glyph-layout';
import { arrowGeometry, boxCenter, ellipseGeometry, frameBounds, identity, inversePoint, rotatePoint, rotationOf, transformPoint } from './transform';
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function ellipseDistance(p: Point, rx: number, ry: number): number {
  // Reflect into the first quadrant and put the major axis first.
  let x = Math.abs(p.x), y = Math.abs(p.y), major = rx, minor = ry;
  if (major < minor) { [major, minor] = [minor, major]; [x, y] = [y, x]; }
  if (minor < 1e-8) return Math.hypot(Math.max(0, x - major), y);
  if (y < 1e-10) {
    const gap = major * major - minor * minor;
    const qx = gap > 0 ? major * major * x / gap : major;
    if (qx < major) return Math.hypot(qx - x, minor * Math.sqrt(Math.max(0, 1 - (qx / major) ** 2)));
    return Math.abs(x - major);
  }
  // The closest point satisfies q_i = r_i² p_i / (lambda + r_i²).
  // Solve its ellipse constraint by bisection, normalized by minor².
  const ratio = (major / minor) ** 2, zx = x / major, zy = y / minor;
  let lo = zy - 1, hi = Math.max(0, Math.hypot(ratio * zx, zy) - 1);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    const constraint = (ratio * zx / (mid + ratio)) ** 2 + (zy / (mid + 1)) ** 2;
    if (constraint > 1) lo = mid; else hi = mid;
  }
  const root = (lo + hi) / 2;
  return Math.hypot(ratio * x / (root + ratio) - x, y / (root + 1) - y);
}
export function hit(a: Annotation, p: Point, tolerance: number) {
  const rotation = rotationOf(a);
  if (rotation) return hit({ ...a, rotation: 0 }, rotatePoint(p, boxCenter(frameBounds(a)), -rotation), tolerance);
  if (a.type === 'image') { const b = frameBounds(a); return p.x >= b.x - tolerance && p.x <= b.right + tolerance && p.y >= b.y - tolerance && p.y <= b.bottom + tolerance; }
  if (a.type === 'rectangle' && a.transform) return hit({ ...a, start: transformPoint(a.start, a.transform ?? identity), end: transformPoint(a.end, a.transform ?? identity), transform: undefined }, p, tolerance);
  if (a.type === 'arrow') {
    const { start, end, head } = arrowGeometry(a), distance = tolerance + a.width / 2;
    return segmentDistance(p, start, end) <= distance || head.some(v => segmentDistance(p, end, v) <= distance);
  }
  if (a.type === 'circle') {
    const { center, rx, ry } = ellipseGeometry(a);
    return ellipseDistance({ x: p.x - center.x, y: p.y - center.y }, rx, ry) <= tolerance + a.width / 2;
  }
  if (a.type === 'freehand') {
    const t = a.transform ?? identity;
    return a.points.some((v, i) => segmentDistance(p, transformPoint(a.points[Math.max(0, i - 1)], t), transformPoint(v, t)) <= tolerance + a.width / 2);
  }
  if ('transform' in a && a.transform) return hit({ ...a, transform: undefined }, inversePoint(p, a.transform), tolerance / Math.min(a.transform.sx, a.transform.sy));
  if (a.type === 'text' || a.type === 'emoji') { const b = measureGlyph(a).bounds; return p.x >= b.x - tolerance && p.x <= b.right + tolerance && p.y >= b.y - tolerance && p.y <= b.bottom + tolerance; }
  const t = tolerance + a.width / 2;
  if ('points' in a) return a.points.some((v, i) => segmentDistance(p, a.points[Math.max(0, i - 1)], v) <= t);
  const left = Math.min(a.start.x, a.end.x), right = Math.max(a.start.x, a.end.x), top = Math.min(a.start.y, a.end.y), bottom = Math.max(a.start.y, a.end.y);
  return p.x >= left - t && p.x <= right + t && p.y >= top - t && p.y <= bottom + t && Math.min(Math.abs(p.x - left), Math.abs(p.x - right), Math.abs(p.y - top), Math.abs(p.y - bottom)) <= t;
}
export function hitTest(annotations: Annotation[], point: Point, tolerance: number) {
  // Colored annotations are always composited above blur, regardless of creation order.
  const ordered = [...annotations.filter(a => a.type === 'blurStroke'), ...annotations.filter(a => a.type !== 'blurStroke')];
  return ordered.reverse().find(a => hit(a, point, tolerance))?.id ?? null;
}
