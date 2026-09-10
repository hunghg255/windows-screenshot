function chunk(name: string, data: Buffer) {
  const size = Buffer.alloc(4); size.writeUInt32LE(data.length);
  return Buffer.concat([Buffer.from(name), size, data, ...(data.length % 2 ? [Buffer.alloc(1)] : [])]);
}
export function animatedWebp(first: Buffer, second: Buffer, width: number, height: number) {
  const extended = Buffer.alloc(10); extended[0] = 2; extended.writeUIntLE(width - 1, 4, 3); extended.writeUIntLE(height - 1, 7, 3);
  const frame = (webp: Buffer) => {
    const header = Buffer.alloc(16); header.writeUIntLE(width - 1, 6, 3); header.writeUIntLE(height - 1, 9, 3); header.writeUIntLE(100, 12, 3); header[15] = 2;
    const data: Buffer[] = [];
    for (let offset = 12; offset + 8 <= webp.length;) {
      const size = webp.readUInt32LE(offset + 4), end = offset + 8 + size + size % 2;
      if (['VP8 ', 'VP8L', 'ALPH'].includes(webp.toString('ascii', offset, offset + 4))) data.push(webp.subarray(offset, end));
      offset = end;
    }
    return chunk('ANMF', Buffer.concat([header, ...data]));
  };
  const body = Buffer.concat([Buffer.from('WEBP'), chunk('VP8X', extended), chunk('ANIM', Buffer.alloc(6)), frame(first), frame(second)]);
  const length = Buffer.alloc(4); length.writeUInt32LE(body.length);
  return Buffer.concat([Buffer.from('RIFF'), length, body]);
}
export function orientedJpeg(jpeg: Buffer) {
  // EXIF/TIFF orientation = 6 (90 degrees clockwise).
  const exif = Buffer.from('45786966000049492a0008000000010012010300010000000600000000000000', 'hex');
  const segment = Buffer.alloc(4); segment[0] = 255; segment[1] = 225; segment.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), segment, exif, jpeg.subarray(2)]);
}
export function animatedPng(first: Buffer, second: Buffer, width: number, height: number) {
  const pngChunk = (name: string, data: Buffer) => {
    const contents = Buffer.concat([Buffer.from(name), data]); let crc = 0xffffffff;
    for (const byte of contents) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, contents, checksum]);
  };
  const idat = (png: Buffer) => {
    const parts: Buffer[] = []; for (let offset = 8; offset + 12 <= png.length;) { const n = png.readUInt32BE(offset); if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + n)); offset += n + 12; } return Buffer.concat(parts);
  };
  const control = (sequence: number) => { const b = Buffer.alloc(26); b.writeUInt32BE(sequence); b.writeUInt32BE(width, 4); b.writeUInt32BE(height, 8); b.writeUInt16BE(1, 20); b.writeUInt16BE(10, 22); return pngChunk('fcTL', b); };
  const actl = Buffer.alloc(8); actl.writeUInt32BE(2);
  const sequence = Buffer.alloc(4); sequence.writeUInt32BE(2);
  return Buffer.concat([first.subarray(0, 33), pngChunk('acTL', actl), control(0), pngChunk('IDAT', idat(first)), control(1), pngChunk('fdAT', Buffer.concat([sequence, idat(second)])), pngChunk('IEND', Buffer.alloc(0))]);
}
