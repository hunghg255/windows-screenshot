import { expect, it } from 'vitest';
import type { ImageAnnotation } from '../src/editor/model';
import { setImageSize } from '../src/editor/image-size';
import { annotationBounds, boxCenter, frameBounds, handlePoint, handles, resizeAnnotation, rotatePoint, rotationOf } from '../src/editor/transform';
import { hitTest } from '../src/editor/hit-test';
const original: ImageAnnotation = { id: 'image', type: 'image', assetId: 'asset', position: { x: 300, y: 300 }, width: 200, height: 100, rotation: Math.PI / 4 };
const canvas = { width: 2000, height: 1200 };
it('numeric size keeps the center, rotation, ratio and image asset', () => {
  const next = setImageSize(original, 'width', 300, true, canvas);
  expect(next.height).toBe(150); expect(next.assetId).toBe('asset'); expect(next.rotation).toBe(original.rotation);
  expect(boxCenter(frameBounds(next))).toEqual(boxCenter(frameBounds(original)));
  expect(setImageSize(original, 'width', 300, false, canvas).height).toBe(100);
  for (const value of [0, -1, NaN, Infinity, 10000]) expect(() => setImageSize(original, 'width', value, true, canvas)).toThrow();
});
it('keeps the opposite world anchor for all eight handles after rotation', () => {
  for (const handle of handles) {
    const anchor = (a: ImageAnnotation) => rotatePoint(handlePoint(frameBounds(a), handle, true), boxCenter(frameBounds(a)), rotationOf(a));
    const next = resizeAnnotation(original, annotationBounds(original), handle, { x: 13, y: 19 }, false, canvas) as ImageAnnotation;
    expect(anchor(next).x).toBeCloseTo(anchor(original).x, 8); expect(anchor(next).y).toBeCloseTo(anchor(original).y, 8);
    expect(next.width).toBeGreaterThanOrEqual(2); expect(next.height).toBeGreaterThanOrEqual(2);
    expect(hitTest([next], boxCenter(frameBounds(next)), 0)).toBe('image');
  }
});
it('hits the rotated frame interior and topmost image', () => {
  expect(hitTest([original], original.position, 0)).toBeNull();
  expect(hitTest([original, { ...original, id: 'top' }], boxCenter(frameBounds(original)), 0)).toBe('top');
});
