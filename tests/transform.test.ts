import { describe, it, expect } from 'vitest';
import { frameBounds, handlePoint, handles, identity, inversePoint, moveAnnotation, resizeAnnotation, resizedBox, transformBox } from '../src/editor/transform';
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

describe('fixed circle and freehand stroke resizing', () => {
  const circle: Drawing = { ...shape, type: 'circle', end: { x: 300, y: 300 }, width: 8 };
  const line: Drawing = { id: 'l', type: 'freehand', width: 8, color: '#f00', points: [{ x: 100, y: 100 }, { x: 200, y: 150 }, { x: 300, y: 300 }] };
  it.each(handles)('%s preserves the opposite ink anchor and fixed padding', handle => {
    for (const a of [circle, line]) {
      const before = JSON.stringify(a), b = frameBounds(a), anchor = handlePoint(b, handle, true);
      const updated = resizeAnnotation(a, b, handle, { x: 40, y: 30 }, false, image) as Drawing;
      const next = frameBounds(updated), fixed = handlePoint(next, handle, true);
      expect(fixed.x).toBeCloseTo(anchor.x); expect(fixed.y).toBeCloseTo(anchor.y);
      expect(updated.width).toBe(8); expect(JSON.stringify(a)).toBe(before);
      expect(next.right - next.x).toBeCloseTo(200 * updated.transform!.sx + 8);
      expect(next.bottom - next.y).toBeCloseTo(200 * updated.transform!.sy + 8);
    }
  });
  it('locks geometry ratio, clamps ink to image, and has no repeated resize drift', () => {
    for (const a of [circle, line]) {
      const locked = resizeAnnotation(a, frameBounds(a), 'se', { x: 100, y: 20 }, true, image) as Drawing;
      expect(locked.transform!.sx).toBeCloseTo(locked.transform!.sy);
      const clamped = resizeAnnotation(a, frameBounds(a), 'se', { x: 10000, y: 10000 }, false, image);
      expect(frameBounds(clamped).right).toBeCloseTo(image.width); expect(frameBounds(clamped).bottom).toBeCloseTo(image.height);
      let current: Drawing = a;
      for (let i = 0; i < 20; i++) {
        current = resizeAnnotation(current, frameBounds(current), 'se', { x: 80, y: 40 }, false, image) as Drawing;
        current = resizeAnnotation(current, frameBounds(current), 'se', { x: -80, y: -40 }, false, image) as Drawing;
      }
      for (const key of ['x', 'y', 'right', 'bottom'] as const) expect(frameBounds(current)[key]).toBeCloseTo(frameBounds(a)[key]);
      const tiny = frameBounds(resizeAnnotation(a, frameBounds(a), 'se', { x: -10000, y: -10000 }, false, image));
      expect(tiny.right - tiny.x).toBeCloseTo(10); expect(tiny.bottom - tiny.y).toBeCloseTo(10);
    }
  });
  it('keeps degenerate freehand geometry and dot diameter without growing phantom axes', () => {
    for (const points of [[{ x: 100, y: 100 }], [{ x: 100, y: 100 }, { x: 100, y: 100 }], [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 100, y: 100 }, { x: 100, y: 200 }]]) {
      const a = { ...line, points };
      for (const handle of handles) {
        const updated = resizeAnnotation(a, frameBounds(a), handle, { x: 40, y: 30 }, false, image) as typeof a;
        expect(updated.points).toBe(points); expect(Object.values(updated.transform!).every(Number.isFinite)).toBe(true);
        const b = frameBounds(updated);
        if (points.every(p => p.x === points[0].x)) expect(b.right - b.x).toBeCloseTo(8);
        if (points.every(p => p.y === points[0].y)) expect(b.bottom - b.y).toBeCloseTo(8);
      }
    }
    const horizontal = { ...line, points: [{ x: 100, y: 100 }, { x: 300, y: 100 }] };
    const shrunk = resizeAnnotation(horizontal, frameBounds(horizontal), 'se', { x: -100, y: 80 }, true, image);
    expect(frameBounds(shrunk).right - frameBounds(shrunk).x).toBeCloseTo(108);
    expect(frameBounds(shrunk).bottom - frameBounds(shrunk).y).toBeCloseTo(8);
  });
});

