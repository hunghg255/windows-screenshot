import { expect, it, vi } from 'vitest';
import { type Drawing, nonEmpty } from '../src/editor/model';
import { frameBounds, resizeAnnotation } from '../src/editor/transform';
import { hit } from '../src/editor/hit-test';
import { paint } from '../src/editor/render';
const line: Drawing = { id: 'line', type: 'line', start: { x: 30, y: 40 }, end: { x: 130, y: 40 }, width: 8, color: '#ff0000' };
it('paints a single segment with no arrowhead, keeping stroke width after resize', () => {
  const resized = resizeAnnotation(line, frameBounds(line), 'se', { x: 100, y: 20 }, false, { width: 800, height: 600 });
  const ctx = { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), lineWidth: 0 };
  paint(ctx as unknown as CanvasRenderingContext2D, resized);
  expect(ctx.lineTo).toHaveBeenCalledTimes(1); expect(ctx.lineWidth).toBe(8);
  expect(frameBounds(resized).bottom - frameBounds(resized).y).toBe(8);
  expect(frameBounds(resized).right - frameBounds(resized).x).toBe(208);
});
it('handles horizontal, vertical and diagonal ink without selecting the empty bounding box', () => {
  expect(hit(line, { x: 80, y: 43 }, 0)).toBe(true);
  expect(hit(line, { x: 80, y: 45 }, 0)).toBe(false);
  const diagonal = { ...line, end: { x: 130, y: 140 } };
  expect(hit(diagonal, { x: 30, y: 140 }, 2)).toBe(false);
  for (const end of [{ x: 30, y: 140 }, { x: 130, y: 40 }]) {
    const a = { ...line, end }, resized = resizeAnnotation(a, frameBounds(a), 'se', { x: 20, y: 20 }, true, { width: 800, height: 600 });
    expect(Object.values(frameBounds(resized)).every(Number.isFinite)).toBe(true);
  }
  expect(nonEmpty({ ...line, end: line.start })).toBe(false);
});
