import { imageMemoryLimit, validateImageSize, type ImportedImage } from '../../shared/image-import';
import type { Annotation } from './model';
import { svgSource } from './svg-source';
type Asset = { source: CanvasImageSource; width: number; height: number; vector?: boolean; raster?: HTMLCanvasElement; dispose(): void };
type Decoder = { tracks: { ready: Promise<void> }; decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>; close(): void };
type DecoderConstructor = new (options: { data: Uint8Array; type: string; preferAnimation: boolean }) => Decoder;
export class ImageAssets {
  private assets = new Map<string, Asset>();
  private generation = 0;
  async add(input: ImportedImage) {
    const generation = this.generation;
    const checkBudget = (width: number, height: number) => {
      validateImageSize(width, height);
      if (this.memory() + width * height * 4 > imageMemoryLimit) throw new Error('Too many images. Delete an image before inserting another.');
    };
    let asset: Asset;
    if (input.mime === 'image/svg+xml') {
      const svg = svgSource(input.bytes), img = new Image();
      checkBudget(svg.width, svg.height);
      const url = URL.createObjectURL(new Blob([svg.source], { type: input.mime }));
      try {
        img.src = url; await timed(img.decode(), () => { img.src = ''; });
        asset = { source: img, width: svg.width, height: svg.height, vector: true, dispose: () => { img.src = ''; URL.revokeObjectURL(url); } };
      } catch (error) { URL.revokeObjectURL(url); throw error; }
    } else if (input.mime === 'image/jpeg') {
      if (input.width && input.height) checkBudget(input.width, input.height);
      // HTML image decoding applies EXIF orientation; ImageDecoder's VideoFrame does not.
      const img = new Image(), url = URL.createObjectURL(new Blob([new Uint8Array(input.bytes)], { type: input.mime }));
      try {
        img.src = url; await timed(img.decode(), () => { img.src = ''; });
        checkBudget(img.naturalWidth, img.naturalHeight);
        const surface = document.createElement('canvas'); surface.width = img.naturalWidth; surface.height = img.naturalHeight;
        surface.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0);
        asset = { source: surface, width: surface.width, height: surface.height, dispose: () => { surface.width = 0; surface.height = 0; } };
      } finally { img.src = ''; URL.revokeObjectURL(url); }
    } else {
      if (input.width && input.height) checkBudget(input.width, input.height);
      const ImageDecoder = (globalThis as unknown as { ImageDecoder: DecoderConstructor }).ImageDecoder;
      if (!ImageDecoder) throw new Error('The image decoder is unavailable.');
      const decoder = new ImageDecoder({ data: input.bytes, type: input.mime, preferAnimation: true });
      let frame: VideoFrame | undefined;
      try {
        await timed(decoder.tracks.ready, () => decoder.close());
        frame = (await timed(decoder.decode({ frameIndex: 0 }), () => decoder.close())).image;
        checkBudget(frame.displayWidth, frame.displayHeight);
        const bitmap = await createImageBitmap(frame);
        const surface = document.createElement('canvas'); surface.width = bitmap.width; surface.height = bitmap.height;
        try { surface.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, 0, 0); } finally { bitmap.close(); }
        asset = { source: surface, width: surface.width, height: surface.height, dispose: () => { surface.width = 0; surface.height = 0; } };
      } finally { frame?.close(); decoder.close(); }
    }
    const used = this.memory();
    if (generation !== this.generation || used + asset.width * asset.height * 4 > imageMemoryLimit) {
      asset.dispose(); throw new Error(generation !== this.generation ? 'This capture session has ended.' : 'Too many images. Delete an image before inserting another.');
    }
    const id = crypto.randomUUID(); this.assets.set(id, asset);
    return { assetId: id, width: asset.width, height: asset.height };
  }
  private memory() { return [...this.assets.values()].reduce((total, a) => total + a.width * a.height * 4 + (a.raster ? a.raster.width * a.raster.height * 4 : 0), 0); }
  get = (id: string, width?: number, height?: number): CanvasImageSource => {
    const asset = this.assets.get(id);
    if (!asset) throw new Error('An inserted image is unavailable. Please insert it again.');
    if (asset.vector && width && height) {
      const w = Math.ceil(width), h = Math.ceil(height);
      validateImageSize(w, h);
      if (asset.raster?.width !== w || asset.raster?.height !== h) {
        const oldCost = asset.raster ? asset.raster.width * asset.raster.height * 4 : 0;
        if (this.memory() - oldCost + w * h * 4 > imageMemoryLimit) throw new Error('Image size exceeds the available image memory.');
        if (asset.raster) { asset.raster.width = 0; asset.raster.height = 0; }
        const raster = document.createElement('canvas'); raster.width = w; raster.height = h;
        raster.getContext('2d', { willReadFrequently: true })!.drawImage(asset.source, 0, 0, w, h);
        asset.raster = raster;
      }
      return asset.raster;
    }
    return asset.source;
  };
  retain(annotations: Annotation[]) {
    const ids = new Set(annotations.flatMap(a => a.type === 'image' ? [a.assetId] : []));
    for (const [id, asset] of this.assets) if (!ids.has(id)) { if (asset.raster) asset.raster.width = 0; asset.dispose(); this.assets.delete(id); }
  }
  dispose() { this.generation++; for (const a of this.assets.values()) { if (a.raster) a.raster.width = 0; a.dispose(); } this.assets.clear(); }
}
async function timed<T>(promise: Promise<T>, abort: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => { abort(); reject(new Error('The image took too long to decode.')); }, 10000); })]); }
  finally { clearTimeout(timer!); }
}
