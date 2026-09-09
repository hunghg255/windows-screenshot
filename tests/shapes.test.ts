import { expect, it } from 'vitest';
import { arrowHead, nonEmpty, shapeEnd } from '../src/editor/model';
it('keeps squares in bounds in all quadrants', () => {
  for (const x of [0, 100]) for (const y of [0, 100]) {
    const end = shapeEnd({ x: 20, y: 30 }, { x, y }, true, { width: 100, height: 100 });
    expect(Math.abs(end.x - 20)).toBe(Math.abs(end.y - 30)); expect(end.x).toBeGreaterThanOrEqual(0); expect(end.y).toBeGreaterThanOrEqual(0);
  }
});
it('points arrowheads backward relative to the tip in eight directions', () => {
  for (let i = 0; i < 8; i++) {
    const end = { x: 100 * Math.cos(i * Math.PI / 4), y: 100 * Math.sin(i * Math.PI / 4) };
    for (const p of arrowHead({ x: 0, y: 0 }, end, 4)) expect((p.x - end.x) * end.x + (p.y - end.y) * end.y).toBeLessThan(0);
  }
  expect(nonEmpty({ id: 'a', type: 'arrow', color: '#000', width: 4, start: { x: 1, y: 1 }, end: { x: 1, y: 1 } })).toBe(false);
});
