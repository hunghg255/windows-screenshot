import { expect, it } from 'vitest';
import { hitTest } from '../src/editor/hit-test';
import type { Annotation } from '../src/editor/model';
it('selects the visually top object, including colored objects over newer blur', () => {
  const a: Annotation = { id: 'color', type: 'freehand', width: 4, color: '#f00', points: [{ x: 0, y: 10 }, { x: 100, y: 10 }] };
  const blur: Annotation = { id: 'blur', type: 'blurStroke', width: 40, points: [{ x: 50, y: 10 }] };
  expect(hitTest([a, blur], { x: 50, y: 10 }, 2)).toBe('color');
  expect(hitTest([a, blur], { x: 50, y: 25 }, 2)).toBe('blur');
  expect(hitTest([a, blur], { x: 500, y: 500 }, 2)).toBeNull();
});
