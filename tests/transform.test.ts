import { describe, it, expect } from 'vitest';
import { handles, identity, inversePoint, moveAnnotation, resizeAnnotation, resizedBox, transformBox } from '../src/editor/transform';
import { annotationBounds } from '../src/editor/render';
import { hit } from '../src/editor/hit-test';
import type { Drawing } from '../src/editor/model';
const box = { x: 100, y: 100, right: 300, bottom: 200 }, image = { width: 1000, height: 800 };
const shape: Drawing = { id: 'shape', type: 'rectangle', start: { x: 100, y: 100 }, end: { x: 300, y: 200 }, width: 4, color: '#f00' };
describe('annotation transforms', () => {
  it.each(handles)('%s keeps the opposite anchor and does not flip', handle => {
    const b = resizedBox(box, handle, { x: 30, y: 20 }, false);
    if (handle.includes('w')) expect(b.right).toBe(box.right); else if (handle.includes('e')) expect(b.x).toBe(box.x); else expect([b.x, b.right]).toEqual([box.x, box.right]);
    if (handle.includes('n')) expect(b.bottom).toBe(box.bottom); else if (handle.includes('s')) expect(b.y).toBe(box.y); else expect([b.y, b.bottom]).toEqual([box.y, box.bottom]);
    for (const delta of [-10000, 10000]) { const tiny = resizedBox(box, handle, { x: delta, y: delta }, false); expect(tiny.right - tiny.x).toBeGreaterThanOrEqual(1.999); expect(tiny.bottom - tiny.y).toBeGreaterThanOrEqual(1.999); }
  });
  it('locks aspect, centers edge expansion and clamps moves to the image', () => {
    const b = resizedBox(box, 'e', { x: 100, y: 0 }, true);
    expect(b).toEqual({ x: 100, right: 400, y: 75, bottom: 225 });
    const moved = moveAnnotation(shape, box, { x: -999, y: 999 }, image) as Drawing;
    expect(moved.transform).toEqual({ ...identity, x: -100, y: 600 });
    expect(shape.transform).toBeUndefined();
  });
  it('composes from a snapshot, round-trips hit testing and clamps anchored resize', () => {
    const original = { ...shape, transform: { x: 50, y: 20, sx: 2, sy: 3 } };
    const b = annotationBounds(original, 0);
    const updated = resizeAnnotation(original, b, 'se', { x: 10000, y: 10000 }, false, image) as Drawing;
    expect(annotationBounds(updated, 0).right).toBeCloseTo(1000); expect(annotationBounds(updated, 0).bottom).toBeCloseTo(800);
    expect(resizeAnnotation(original, b, 'se', { x: 10000, y: 10000 }, false, image)).toEqual(updated);
    const t = updated.transform!, local = { x: 100, y: 150 }, p = { x: local.x * t.sx + t.x, y: local.y * t.sy + t.y };
    expect(inversePoint(p, t)).toEqual(local); expect(hit(updated, p, 2)).toBe(true);
    expect(transformBox(box, identity)).toEqual(box);
  });
  it('handles horizontal strokes, dots and clipped objects without NaN or teleporting', () => {
    for (const points of [[{ x: 100, y: 100 }], [{ x: 100, y: 100 }, { x: 200, y: 100 }]]) {
      const line: Drawing = { id: 'line', type: 'freehand', color: '#f00', width: 1, points };
      const next = resizeAnnotation(line, annotationBounds(line, 0), 'n', { x: 0, y: -20 }, false, image) as Drawing;
      expect(Object.values(next.transform!).every(Number.isFinite)).toBe(true);
    }
    const clipped = { x: -50, y: 20, right: 200, bottom: 100 };
    expect((moveAnnotation(shape, clipped, { x: 0, y: 0 }, image) as Drawing).transform).toEqual(identity);
  });
});

