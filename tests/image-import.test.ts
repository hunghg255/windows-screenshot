import { expect, it } from 'vitest';
import { inspectImage, validateImageSize } from '../shared/image-import';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64');
it('checks signatures, extension aliases and dimensions before decoding', () => {
  expect(inspectImage(png, '.PNG').mime).toBe('image/png');
  expect(() => inspectImage(png, 'jpg')).toThrow();
  expect(() => inspectImage(new Uint8Array(), 'svg')).toThrow();
  const large = Buffer.from(png); large.writeUInt32BE(20000, 16);
  expect(() => inspectImage(large, 'png')).toThrow('limit');
  for (const n of [0, -1, Infinity, NaN, 20000]) expect(() => validateImageSize(n, 100)).toThrow();
  expect(() => validateImageSize(10000, 10000)).toThrow();
});
it('handles jpg/jpeg SOF and rejects truncated JPEG segments', () => {
  const jpeg = Uint8Array.from([255,216,255,192,0,8,8,0,32,0,64,1]);
  for (const ext of ['jpg', 'jpeg']) expect(inspectImage(jpeg, ext).mime).toBe('image/jpeg');
  expect(() => inspectImage(jpeg.subarray(0, 10), 'jpeg')).toThrow();
});
it('reads WebP VP8X dimensions and checks RIFF length', () => {
  const b = Buffer.alloc(30); b.write('RIFF'); b.writeUInt32LE(22,4); b.write('WEBPVP8X',8); b[24]=31; b[27]=63;
  expect(inspectImage(b, 'webp').mime).toBe('image/webp');
  b[26]=255; expect(() => inspectImage(b, 'webp')).toThrow();
  b.writeUInt32LE(9000,4); expect(() => inspectImage(b, 'webp')).toThrow('Invalid WebP');
});
