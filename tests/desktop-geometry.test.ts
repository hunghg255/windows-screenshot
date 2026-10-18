import { expect, it } from 'vitest';
import { desktopLayout, desktopPixels, desktopRegion, intersects } from '../shared/desktop-geometry';
const displays = [{ id: 1, bounds: { x: -100, y: 0, width: 100, height: 80 }, scaleFactor: 1 }, { id: 2, bounds: { x: 0, y: -20, width: 100, height: 100 }, scaleFactor: 1.5 }, { id: 3, bounds: { x: 100, y: 0, width: 60, height: 120 }, scaleFactor: 2 }];
it('maps three differently scaled screens, negative origins and shared edges', () => {
  const layout = desktopLayout(displays);
  expect(layout).toMatchObject({ bounds: { x: -100, y: -20, width: 260, height: 140 }, scale: 2, width: 520, height: 280 });
  expect(desktopPixels(displays[0].bounds, layout)).toEqual({ x: 0, y: 40, width: 200, height: 160 });
  const region = desktopRegion({ x: 150, y: 90 }, { x: -80, y: 10 }, layout);
  expect(desktopPixels(region, layout)).toEqual({ x: 40, y: 60, width: 460, height: 160 });
  expect(desktopRegion({ x: -80, y: 10 }, { x: 150, y: 90 }, layout)).toEqual(region);
  expect(displays.some(d => intersects({ x: -90, y: -19, width: 20, height: 10 }, d.bounds))).toBe(false);
});
it('keeps fractional scale shared edges contiguous and single screen pixels native', () => {
  const ds = displays.slice(0, 2).map(d => ({ ...d, scaleFactor: 1.25 })), layout = desktopLayout(ds);
  const a = desktopPixels(ds[0].bounds, layout), b = desktopPixels(ds[1].bounds, layout);
  expect(a.x + a.width).toBe(b.x);
  expect(desktopLayout([ds[0]])).toMatchObject({ width: 125, height: 100 });
});
it('rejects missing, invalid and oversized desktops before allocating buffers', () => {
  expect(() => desktopLayout([])).toThrow();
  for (const width of [0, Infinity, 20000]) expect(() => desktopLayout([{ ...displays[0], bounds: { x: 0, y: 0, width, height: 2000 } }])).toThrow();
});
