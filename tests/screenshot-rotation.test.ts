import { expect, it } from 'vitest';
import { rotatedSize, sceneMatrix, scenePoint, sourcePoint, sourceVector, type QuarterTurns } from '../src/editor/screenshot-rotation';
import { useEditor } from '../src/stores/editor';
import { decodePng } from '../electron/image-output';

it('maps non-square scene corners and reverses points and drag vectors in all orientations', () => {
  const size = { width: 320, height: 180 }, point = { x: 70, y: 40 };
  const expected = [{ x: 70, y: 40 }, { x: 140, y: 70 }, { x: 250, y: 140 }, { x: 40, y: 250 }];
  for (const turns of [0, 1, 2, 3] as QuarterTurns[]) {
    expect(scenePoint(point, size, turns)).toEqual(expected[turns]);
    const [a, b, c, d, e, f] = sceneMatrix(size, turns);
    for (const p of [point, { x: 0, y: 0 }, { x: 320, y: 0 }, { x: 0, y: 180 }, { x: 320, y: 180 }, { x: 160, y: 90 }]) {
      const rotated = scenePoint(p, size, turns);
      expect(rotated).toEqual({ x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f });
      expect(sourcePoint(rotated, size, turns)).toEqual(p);
    }
    expect(sourceVector({ x: 10, y: 20 }, turns)).toEqual([{ x: 10, y: 20 }, { x: 20, y: -10 }, { x: -10, y: -20 }, { x: -20, y: 10 }][turns]);
    expect(rotatedSize(size, turns)).toEqual(turns % 2 ? { width: 180, height: 320 } : size);
  }
});

it('cycles orientation without mutating annotations and resets for a new session', () => {
  const s = useEditor.getState(); s.reset();
  s.add({ id: 'a', type: 'freehand', points: [{ x: 12, y: 20 }], color: '#f00', width: 4 });
  const annotations = useEditor.getState().annotations;
  for (const expected of [1, 2, 3, 0, 1]) {
    s.rotateScreenshot(); expect(useEditor.getState().quarterTurns).toBe(expected);
    expect(useEditor.getState().annotations).toBe(annotations);
  }
  s.reset(); expect(useEditor.getState().quarterTurns).toBe(0);
});

it('accepts only original or swapped PNG dimensions at the output boundary', () => {
  const png = (w: number, h: number) => {
    const b = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a', 'hex').copy(b);
    b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
    return `data:image/png;base64,${b.toString('base64')}`;
  };
  expect(() => decodePng(png(320, 180), 320, 180)).not.toThrow();
  expect(() => decodePng(png(180, 320), 320, 180)).not.toThrow();
  for (const [w, h] of [[320, 320], [180, 180], [319, 180], [640, 360]]) expect(() => decodePng(png(w, h), 320, 180)).toThrow();
});
