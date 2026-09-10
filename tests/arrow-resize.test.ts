import { expect, it } from 'vitest';
import type { Drawing } from '../src/editor/model';
import { arrowGeometry, boxCenter, frameBounds, handlePoint, handles, resizeAnnotation, rotatePoint } from '../src/editor/transform';
import { hit } from '../src/editor/hit-test';
import { useEditor } from '../src/stores/editor';

const image = { width: 2000, height: 1600 };
const arrow: Extract<Drawing, { start: unknown }> = { id: 'a', type: 'arrow', start: { x: 300, y: 300 }, end: { x: 500, y: 450 }, color: '#f00', width: 8 };
it.each(handles)('arrow %s keeps its rotated opposite anchor, width and symmetric head', handle => {
  for (const end of [{ x: 500, y: 450 }, { x: 500, y: 300 }, { x: 300, y: 500 }, { x: 120, y: 180 }]) {
    for (const rotation of [0, Math.PI / 4, Math.PI / 2]) {
      const a = { ...arrow, end, rotation }, before = structuredClone(a);
      const anchor = (v: typeof a) => rotatePoint(handlePoint(frameBounds(v), handle, true), boxCenter(frameBounds(v)), rotation);
      const next = resizeAnnotation(a, frameBounds(a), handle, rotatePoint({ x: 40, y: 25 }, { x: 0, y: 0 }, rotation), false, image) as typeof a;
      expect(anchor(next).x).toBeCloseTo(anchor(a).x); expect(anchor(next).y).toBeCloseTo(anchor(a).y);
      expect(next.width).toBe(8); expect(a).toEqual(before);
      const { start, end: tip, head } = arrowGeometry(next), b = frameBounds(next);
      for (const p of head) expect(Math.hypot(p.x - tip.x, p.y - tip.y)).toBeCloseTo(24);
      const axis = { x: tip.x - start.x, y: tip.y - start.y };
      const cross = head.map(p => axis.x * (p.y - tip.y) - axis.y * (p.x - tip.x));
      expect(cross[0]).toBeCloseTo(-cross[1]);
      for (const p of [start, tip, ...head]) { expect(p.x - 4).toBeGreaterThanOrEqual(b.x - 1e-8); expect(p.y + 4).toBeLessThanOrEqual(b.bottom + 1e-8); }
    }
  }
});

it('arrow hit testing uses fixed width on both shaft and head after scale and rotation', () => {
  const a = { ...arrow, end: { x: 500, y: 300 }, transform: { x: 10, y: 20, sx: 2, sy: .5 }, rotation: Math.PI / 4 };
  const { start, end, head } = arrowGeometry(a), center = boxCenter(frameBounds(a));
  for (const [from, to] of [[start, end], [end, head[0]]]) {
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
    for (const offset of [5.9, 6.1]) {
      const p = { x: (from.x + to.x) / 2 - dy / length * offset, y: (from.y + to.y) / 2 + dx / length * offset };
      // Head samples must be on the outside of the V, away from its shaft.
      const outside = from === end ? { x: (from.x + to.x) / 2 + dy / length * offset, y: (from.y + to.y) / 2 - dx / length * offset } : p;
      expect(hit(a, rotatePoint(outside, center, a.rotation), 2)).toBe(offset < 6);
    }
  }
});

it('short arrows keep finite fitted heads; Shift shrinks a horizontal shaft and clamps rotated ink', () => {
  const flat = { ...arrow, end: { x: 500, y: 300 } };
  const next = resizeAnnotation(flat, frameBounds(flat), 'se', { x: -100, y: 30 }, true, image) as typeof flat;
  const g = arrowGeometry(next); expect(Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y)).toBeCloseTo(100);
  const short = { ...arrow, end: { x: 302, y: 300 } }, geometry = arrowGeometry(short);
  for (const p of geometry.head) expect(Math.hypot(p.x - geometry.end.x, p.y - geometry.end.y)).toBeCloseTo(1.2);
  const rotated = { ...arrow, rotation: Math.PI / 4 };
  const resized = resizeAnnotation(rotated, frameBounds(rotated), 'se', { x: 10000, y: 10000 }, false, image);
  for (const p of [arrowGeometry(resized as typeof arrow).start, arrowGeometry(resized as typeof arrow).end]) {
    const world = rotatePoint(p, boxCenter(frameBounds(resized)), rotated.rotation);
    expect(world.x).toBeGreaterThanOrEqual(0); expect(world.x).toBeLessThanOrEqual(image.width);
    expect(world.y).toBeGreaterThanOrEqual(0); expect(world.y).toBeLessThanOrEqual(image.height);
  }
});

it('selected arrow Size changes width and head without moving its rotated shaft', () => {
  const s = useEditor.getState(); s.reset();
  const a = { ...arrow, end: { x: 301, y: 500 }, rotation: Math.PI / 3 }; s.add(a); s.select(a.id);
  expect(useEditor.getState().width).toBe(8); s.setWidth(16);
  const next = useEditor.getState().annotations[0] as typeof a;
  expect(next.width).toBe(16);
  for (const key of ['start', 'end'] as const) {
    const before = rotatePoint(arrowGeometry(a)[key], boxCenter(frameBounds(a)), a.rotation);
    const after = rotatePoint(arrowGeometry(next)[key], boxCenter(frameBounds(next)), next.rotation);
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y);
  }
  s.reset();
});
