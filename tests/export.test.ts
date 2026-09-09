import { expect, it } from 'vitest';
import { decodePng } from '../electron/image-output';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
it('accepts matching PNG dimensions and rejects foreign payloads or mismatched sizes', () => {
  expect(decodePng(png, 1, 1).length).toBeGreaterThan(33);
  expect(() => decodePng(png, 2, 1)).toThrow('dimensions');
  expect(() => decodePng('data:image/jpeg;base64,abc', 1, 1)).toThrow();
  expect(() => decodePng('data:image/png;base64,aaaa', 1, 1)).toThrow();
});
