import { describe, expect, it, vi } from 'vitest';
import type { Annotation, Drawing, TextAnnotation } from '../src/editor/model';
import { annotationBounds, boxCenter, frameBounds, handlePoint, handles, normalizeAngle, orientedCorners, preserveGlyphOrigin, resizeAnnotation, rotatePoint, rotationFromPointer, translated } from '../src/editor/transform';
import { hit } from '../src/editor/hit-test';
import { useEditor } from '../src/stores/editor';

vi.mock('../src/editor/glyph-layout', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/editor/glyph-layout')>();
  return { ...actual, measureGlyph: (a: import('../src/editor/model').GlyphAnnotation) => {
    const size = a.type === 'text' ? a.fontSize : a.size;
    return actual.glyphLayout(a, line => ({ width: line.length * size * .6, actualBoundingBoxLeft: 2, actualBoundingBoxRight: line.length * size * .6, actualBoundingBoxAscent: size, actualBoundingBoxDescent: size * .2 }));
  } };
});
const image = { width: 1800, height: 1400 };
const rectangle: Drawing = { id: 'r', type: 'rectangle', start: { x: 400, y: 400 }, end: { x: 620, y: 520 }, color: '#f00', width: 8 };
const text: TextAnnotation = { id: 't', type: 'text', position: { x: 450, y: 450 }, content: 'Tiếng Việt\nHello', fontSize: 32, fontFamily: 'Segoe UI', lineHeight: 1.25, color: '#f00' };
function closePoint(actual: { x: number; y: number }, expected: { x: number; y: number }) { expect(actual.x).toBeCloseTo(expected.x, 6); expect(actual.y).toBeCloseTo(expected.y, 6); }
const anchor = (a: Annotation, h: typeof handles[number]) => rotatePoint(handlePoint(frameBounds(a), h, true), boxCenter(frameBounds(a)), a.rotation ?? 0);
describe('rotation geometry', () => {
  it.each([0, 45, 90, 180, 270, 360])('round-trips points and encloses every corner at %s degrees', degrees => {
    const angle = degrees * Math.PI / 180, center = boxCenter(frameBounds(rectangle)), p = { x: 420, y: 407 };
    closePoint(rotatePoint(rotatePoint(p, center, angle), center, -angle), p);
    const a = { ...rectangle, rotation: angle }, b = annotationBounds(a, 0);
    closePoint(boxCenter(b), center);
    for (const point of orientedCorners(a)) { expect(point.x).toBeGreaterThanOrEqual(b.x); expect(point.x).toBeLessThanOrEqual(b.right); expect(point.y).toBeGreaterThanOrEqual(b.y); expect(point.y).toBeLessThanOrEqual(b.bottom); }
    if (degrees % 180 === 90) expect(b.right - b.x).toBeCloseTo(128);
  });
  it('crosses the angle seam in both directions, snaps, and ignores the center dead zone', () => {
    const c = { x: 0, y: 0 }, p = { x: 100, y: 0 };
    const at = (deg: number) => rotatePoint(p, c, deg * Math.PI / 180);
    expect(rotationFromPointer(359 * Math.PI / 180, c, p, at(2), false)).toBeCloseTo(Math.PI / 180);
    expect(rotationFromPointer(Math.PI / 180, c, p, at(-2), false)).toBeCloseTo(359 * Math.PI / 180);
    expect(rotationFromPointer(0, c, p, at(23), true)).toBeCloseTo(Math.PI / 6);
    expect(rotationFromPointer(0, c, p, c, false, 2)).toBe(2);
    expect(normalizeAngle(-2 * Math.PI)).toBe(0);
  });
  it.each(handles)('%s preserves its opposite world anchor for all rotated types', h => {
    for (const original of [rectangle, { ...rectangle, type: 'arrow' as const }, text, { id: 'e', type: 'emoji' as const, position: { x: 450, y: 450 }, size: 48, content: '👩‍💻' }]) {
      for (const rotation of [0, Math.PI / 4, Math.PI / 2, Math.PI * 1.5]) {
        const a = { ...original, rotation }, before = structuredClone(a), delta = rotatePoint({ x: h.includes('w') ? -30 : 30, y: h.includes('n') ? -20 : 20 }, { x: 0, y: 0 }, rotation);
        const next = resizeAnnotation(a, annotationBounds(a, 0), h, delta, false, image);
        closePoint(anchor(next, h), anchor(a, h)); expect(next.rotation).toBe(rotation); expect(a).toEqual(before);
        expect(Object.values(annotationBounds(next)).every(Number.isFinite)).toBe(true);
      }
    }
  });
  it('clamps expansion against rotated world corners without moving the anchor', () => {
    const a = { ...rectangle, rotation: Math.PI / 4 }, next = resizeAnnotation(a, annotationBounds(a, 0), 'se', { x: 5000, y: 4000 }, false, image), b = annotationBounds(next, 0);
    closePoint(anchor(next, 'se'), anchor(a, 'se'));
    expect(b.x).toBeGreaterThanOrEqual(-1e-6); expect(b.y).toBeGreaterThanOrEqual(-1e-6); expect(b.right).toBeLessThanOrEqual(image.width + 1e-6); expect(b.bottom).toBeLessThanOrEqual(image.height + 1e-6);
    expect(Math.min(b.x, b.y, image.width - b.right, image.height - b.bottom)).toBeLessThan(1e-5);
  });
  it('retains the world glyph origin after changing content and size', () => {
    const a = { ...text, rotation: Math.PI / 3 }, next = preserveGlyphOrigin(a, { ...a, content: 'New\nLonger text\nLine three', fontSize: 100 });
    closePoint(rotatePoint(a.position, boxCenter(frameBounds(a)), a.rotation), rotatePoint(next.position, boxCenter(frameBounds(next)), next.rotation));
    expect(next.content).toContain('Line three');
  });
  it('keeps selected rectangle width and rotated glyph sizes in sync with the store', () => {
    const store = useEditor.getState(); store.reset(); store.add(rectangle); store.select(rectangle.id);
    expect(useEditor.getState().width).toBe(8); store.setWidth(12);
    expect((useEditor.getState().annotations[0] as Drawing).width).toBe(12);
    const a = { ...text, rotation: Math.PI / 2 }; store.add(a); store.select(a.id); store.setWidth(70);
    const next = useEditor.getState().annotations[1] as TextAnnotation;
    expect(next.fontSize).toBe(70); expect(next.rotation).toBe(a.rotation);
    closePoint(rotatePoint(a.position, boxCenter(frameBounds(a)), a.rotation), rotatePoint(next.position, boxCenter(frameBounds(next)), next.rotation!));
    store.reset();
  });
  it('keeps rectangle centerline aspect and can expand a flat rectangle', () => {
    const next = resizeAnnotation(rectangle, annotationBounds(rectangle, 0), 'se', { x: 70, y: 10 }, true, image), b = frameBounds(next);
    expect((b.right - b.x - 8) / (b.bottom - b.y - 8)).toBeCloseTo(220 / 120);
    for (const end of [{ x: 400, y: 520 }, { x: 620, y: 400 }]) {
      const a = { ...rectangle, end, rotation: Math.PI / 4 }, grown = resizeAnnotation(a, annotationBounds(a, 0), 'se', { x: 0, y: 100 }, false, image);
      const b = frameBounds(grown); expect(b.right - b.x).toBeGreaterThan(8); expect(b.bottom - b.y).toBeGreaterThan(8); closePoint(anchor(grown, 'se'), anchor(a, 'se'));
    }
  });
  it('has no drift on repeated moves or zero-delta resizes and keeps glyph limits', () => {
    let a: Annotation = { ...rectangle, rotation: Math.PI / 4 };
    for (let i = 0; i < 100; i++) { a = translated(translated(a, 13, -7), -13, 7); expect(resizeAnnotation(a, annotationBounds(a, 0), 'se', { x: 0, y: 0 }, false, image)).toBe(a); }
    closePoint(boxCenter(frameBounds(a)), boxCenter(frameBounds(rectangle)));
    for (const dx of [-10000, 10000]) {
      const a = { ...text, rotation: Math.PI / 4 }, next = resizeAnnotation(a, annotationBounds(a, 0), 'se', { x: dx, y: dx }, false, { width: 100000, height: 100000 }) as TextAnnotation;
      expect(next.fontSize).toBeGreaterThanOrEqual(12); expect(next.fontSize).toBeLessThanOrEqual(160); closePoint(anchor(next, 'se'), anchor(a, 'se'));
    }
  });
  it('hit-tests rotated outlines and glyphs without accepting empty AABB corners', () => {
    for (const original of [rectangle, text]) {
      const a = { ...original, rotation: Math.PI / 4 }, b = annotationBounds(a, 0), center = boxCenter(frameBounds(a));
      const point = original.type === 'text' ? center : { x: 400, y: 460 };
      expect(hit(a, rotatePoint(point, center, a.rotation), 1)).toBe(true);
      expect(hit(a, { x: b.x + 1, y: b.y + 1 }, 1)).toBe(false);
    }
  });
});
