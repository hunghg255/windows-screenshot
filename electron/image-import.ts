import { open } from 'node:fs/promises';
import { extname } from 'node:path';
import { imageByteLimit, inspectImage } from '../shared/image-import';
export async function readImportedImage(path: string) {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > imageByteLimit) throw new Error('Choose an image smaller than 20 MiB.');
    const bytes = new Uint8Array(stat.size + 1);
    let total = 0;
    while (total < bytes.length) {
      const { bytesRead } = await file.read(bytes, total, bytes.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total !== stat.size) throw new Error('The image changed while opening. Please try again.');
    return inspectImage(bytes.subarray(0, total), extname(path));
  } finally { await file.close(); }
}
