import { expect, it } from 'vitest';
import { ellipseDistance, hit, hitTest } from '../src/editor/hit-test';
import type { Annotation } from '../src/editor/model';
it('selects the visually top object, including colored objects over newer blur', () => {
  const a: Annotation = { id: 'color', type: 'freehand', width: 4, color: '#f00', points: [{ x: 0, y: 10 }, { x: 100, y: 10 }] };
  const blur: Annotation = { id: 'blur', type: 'blurStroke', width: 40, points: [{ x: 50, y: 10 }] };
  expect(hitTest([a, blur], { x: 50, y: 10 }, 2)).toBe('color');
  expect(hitTest([a, blur], { x: 50, y: 25 }, 2)).toBe('blur');
  expect(hitTest([a, blur], { x: 500, y: 500 }, 2)).toBeNull();
});

it('measures ellipse distance against independently sampled boundaries, including flat ellipses', () => {
  for (const [rx, ry] of [[100, 25], [2, 180], [60, 60], [100, .01]]) {
    for (const [x, y] of [[0, 0], [30, 0], [0, 20], [15, 10], [90, 20], [105, 30], [1, .001]]) {
      let reference = Infinity;
      for (let i = 0; i <= 20000; i++) {
        const angle = i * Math.PI / 40000;
        reference = Math.min(reference, Math.hypot(rx * Math.cos(angle) - x, ry * Math.sin(angle) - y));
      }
      expect(Math.abs(ellipseDistance({ x, y }, rx, ry) - reference)).toBeLessThan(.02);
    }
  }
  expect(ellipseDistance({ x: 3, y: 4 }, 0, 0)).toBe(5);
  expect(ellipseDistance({ x: 30, y: 4 }, 100, 0)).toBe(4);
});

it('uses fixed image-pixel stroke tolerance on transformed ellipses and freehand', () => {
  const circle: Annotation = { id: 'c', type: 'circle', start: { x: 0, y: 0 }, end: { x: 100, y: 100 }, width: 8, color: '#f00', transform: { x: 100, y: 100, sx: 4, sy: .5 } };
  for (const angle of [0, Math.PI / 4, Math.PI / 2]) {
    const normal = { x: Math.cos(angle) / 200, y: Math.sin(angle) / 25 }, length = Math.hypot(normal.x, normal.y);
    for (const offset of [5.9, 6.1]) {
      const p = { x: 300 + 200 * Math.cos(angle) + offset * normal.x / length, y: 125 + 25 * Math.sin(angle) + offset * normal.y / length };
      expect(hit(circle, p, 2)).toBe(offset < 6);
    }
  }
  expect(hit(circle, { x: 300, y: 125 }, 2)).toBe(false);
  const line: Annotation = { id: 'l', type: 'freehand', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 8, color: '#f00', transform: { x: 100, y: 100, sx: 4, sy: .5 } };
  expect(hit(line, { x: 200, y: 105.9 }, 2)).toBe(true);
  expect(hit(line, { x: 200, y: 106.1 }, 2)).toBe(false);
  expect(hit({ ...line, points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }, { x: 105.9, y: 100 }, 2)).toBe(true);
  expect(hit({ ...line, width: 16 }, { x: 200, y: 109.9 }, 2)).toBe(true);
});
