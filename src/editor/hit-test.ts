import type { Point } from '../../shared/contracts';
import { arrowHead, type Annotation } from './model';
import { measureGlyph } from './glyph-layout';
import { inversePoint } from './transform';
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function hit(a: Annotation, p: Point, tolerance: number) {
  if ('transform' in a && a.transform) return hit({ ...a, transform: undefined }, inversePoint(p, a.transform), tolerance / Math.min(a.transform.sx, a.transform.sy));
  if (a.type === 'text' || a.type === 'emoji') { const b = measureGlyph(a).bounds; return p.x >= b.x - tolerance && p.x <= b.right + tolerance && p.y >= b.y - tolerance && p.y <= b.bottom + tolerance; }
  const t = tolerance + a.width / 2;
  if ('points' in a) return a.points.some((v, i) => segmentDistance(p, a.points[Math.max(0, i - 1)], v) <= t);
  if (a.type === 'arrow') return segmentDistance(p, a.start, a.end) <= t || arrowHead(a.start, a.end, a.width).some(v => segmentDistance(p, a.end, v) <= t);
  const left = Math.min(a.start.x, a.end.x), right = Math.max(a.start.x, a.end.x), top = Math.min(a.start.y, a.end.y), bottom = Math.max(a.start.y, a.end.y);
  if (a.type === 'circle') return Math.abs(Math.hypot(p.x - (left + right) / 2, p.y - (top + bottom) / 2) - (right - left) / 2) <= t;
  return p.x >= left - t && p.x <= right + t && p.y >= top - t && p.y <= bottom + t && Math.min(Math.abs(p.x - left), Math.abs(p.x - right), Math.abs(p.y - top), Math.abs(p.y - bottom)) <= t;
}
export function hitTest(annotations: Annotation[], point: Point, tolerance: number) {
  // Colored annotations are always composited above blur, regardless of creation order.
  const ordered = [...annotations.filter(a => a.type === 'blurStroke'), ...annotations.filter(a => a.type !== 'blurStroke')];
  return ordered.reverse().find(a => hit(a, point, tolerance))?.id ?? null;
}
