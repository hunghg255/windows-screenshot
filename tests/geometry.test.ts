import { describe, it, expect } from 'vitest';
import { pixelPoint, region, validRect } from '../shared/geometry';
describe('DIP and bitmap geometry', () => {
  it.each([1, 1.25, 1.5, 2])('maps a display with negative origin at scale %s', scale => {
    expect(pixelPoint({ x: -960, y: 540 }, { x: -1920, y: 0, width: 1920, height: 1080 }, { width: 1920 * scale, height: 1080 * scale })).toEqual({ x: 960 * scale, y: 540 * scale });
  });
  it.each([[10, 20, 90, 80], [90, 80, 10, 20], [10, 80, 90, 20], [90, 20, 10, 80]])('crops in every drag direction', (x, y, bx, by) => {
    expect(region({ x, y }, { x: bx, y: by }, { width: 100, height: 100 })).toEqual({ x: 10, y: 20, width: 80, height: 60 });
  });
  it('clamps and rounds edges using actual bitmap dimensions', () => {
    expect(region({ x: -10, y: 4.8 }, { x: 150, y: 99.1 }, { width: 100, height: 100 })).toEqual({ x: 0, y: 4, width: 100, height: 96 });
    expect(validRect({ x: 0, y: 0, width: 0, height: 1 }, 100, 100)).toBe(false);
    expect(validRect({ x: 0, y: 0, width: NaN, height: 1 }, 100, 100)).toBe(false);
    expect(validRect({ x: 1, y: 0, width: 100, height: 1 }, 100, 100)).toBe(false);
  });
});
