export const imageByteLimit = 20 * 1024 * 1024;
export const imageMemoryLimit = 128 * 1024 * 1024;
export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';
export type ImportedImage = { bytes: Uint8Array; mime: ImageMime; width?: number; height?: number };
export function validateImageSize(width: number, height: number) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0 && n <= 16384) || width * height > 24_000_000) throw new Error('Image exceeds the 24 megapixel / 16384 px limit.');
}
export function inspectImage(bytes: Uint8Array, extension: string): ImportedImage {
  if (!bytes.length || bytes.length > imageByteLimit) throw new Error('Choose an image smaller than 20 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, count: number) => String.fromCharCode(...bytes.subarray(offset, offset + count));
  const ext = extension.toLowerCase().replace(/^\./, '');
  let mime: ImageMime, width = 0, height = 0;
  if (ext === 'svg') return { bytes, mime: 'image/svg+xml' }; // XML is parsed in the sandbox before loading any image.
  if (ext === 'png' && bytes.length >= 33 && text(0, 8) === '\x89PNG\r\n\x1a\n' && text(12, 4) === 'IHDR') {
    mime = 'image/png'; width = view.getUint32(16); height = view.getUint32(20);
  } else if ((ext === 'jpg' || ext === 'jpeg') && bytes[0] === 255 && bytes[1] === 216) {
    mime = 'image/jpeg';
    for (let offset = 2; offset + 3 < bytes.length;) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += length;
    }
  } else if (ext === 'webp' && bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    mime = 'image/webp';
    if (view.getUint32(4, true) + 8 !== bytes.length) throw new Error('Invalid WebP file.');
    const kind = text(12, 4);
    const uint24 = (i: number) => bytes[i] + (bytes[i + 1] << 8) + (bytes[i + 2] << 16);
    if (kind === 'VP8X') { width = uint24(24) + 1; height = uint24(27) + 1; }
    else if (kind === 'VP8 ' && text(23, 3) === '\x9d\x01\x2a') { width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff; }
    else if (kind === 'VP8L' && bytes[20] === 0x2f) { const bits = view.getUint32(21, true); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
  } else throw new Error('Choose a valid PNG, JPG, JPEG, SVG or WebP image.');
  validateImageSize(width, height);
  return { bytes, mime, width, height };
}
