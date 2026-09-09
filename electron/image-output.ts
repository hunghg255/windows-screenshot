export function decodePng(value: unknown, width: number, height: number): Buffer {
  if (typeof value !== 'string' || value.length > 180_000_000 || !value.startsWith('data:image/png;base64,')) throw new Error('Invalid PNG payload.');
  const bytes = Buffer.from(value.slice(22), 'base64');
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height) throw new Error('PNG dimensions do not match this capture.');
  return bytes;
}
