import type { Annotation } from './model';
import { glyphFont, measureGlyph } from './glyph-layout';
import { annotationBounds, arrowGeometry, boxCenter, ellipseGeometry, frameBounds, identity, rotationOf, transformPoint } from './transform';
export { annotationBounds } from './transform';
export function paint(ctx: CanvasRenderingContext2D, a: Annotation, override?: string, asset?: (id: string, width?: number, height?: number) => CanvasImageSource) {
  const rotation = rotationOf(a);
  if (rotation) { const center = boxCenter(frameBounds(a)); ctx.save(); try { ctx.translate(center.x, center.y); ctx.rotate(rotation); ctx.translate(-center.x, -center.y); paint(ctx, { ...a, rotation: 0 }, override, asset); } finally { ctx.restore(); } return; }
  if (a.type === 'image') { if (!asset) throw new Error('Missing image assets.'); ctx.drawImage(asset(a.assetId, a.width, a.height), a.position.x, a.position.y, a.width, a.height); return; }
  if (a.type === 'arrow') {
    const { start, end, head } = arrowGeometry(a);
    ctx.strokeStyle = override ?? a.color; ctx.lineWidth = a.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
    for (const p of head) { ctx.moveTo(end.x, end.y); ctx.lineTo(p.x, p.y); }
    ctx.stroke(); return;
  }
  if (a.type === 'rectangle') {
    const start = transformPoint(a.start, a.transform ?? identity), end = transformPoint(a.end, a.transform ?? identity);
    ctx.strokeStyle = override ?? a.color; ctx.lineWidth = a.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y); ctx.stroke(); return;
  }
  if (a.type === 'circle' || a.type === 'freehand') {
    ctx.strokeStyle = override ?? a.color; ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = a.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    if (a.type === 'circle') {
      const { center, rx, ry } = ellipseGeometry(a);
      ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
    } else if (a.type === 'freehand') {
      if (!a.points.length) return;
      const t = a.transform ?? identity, first = transformPoint(a.points[0], t);
      ctx.moveTo(first.x, first.y);
      let hasLength = false;
      for (let i = 1; i < a.points.length; i++) {
        const p = transformPoint(a.points[i], t); ctx.lineTo(p.x, p.y);
        hasLength ||= p.x !== first.x || p.y !== first.y;
      }
      if (!hasLength) { ctx.beginPath(); ctx.arc(first.x, first.y, a.width / 2, 0, Math.PI * 2); ctx.fill(); return; }
    }
    ctx.stroke(); return;
  }
  if ('transform' in a && a.transform) { const t = a.transform; ctx.save(); ctx.translate(t.x, t.y); ctx.scale(t.sx, t.sy); paint(ctx, { ...a, transform: undefined }, override); ctx.restore(); return; }
  if (a.type === 'text' || a.type === 'emoji') {
    ctx.font = glyphFont(a); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = a.type === 'text' ? a.color : '#000000';
    for (const line of measureGlyph(a).lines) ctx.fillText(line.content, line.x, line.baseline);
    return;
  }
  ctx.strokeStyle = override ?? ('color' in a ? a.color : '#fff'); ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = a.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  if ('points' in a) {
    if (!a.points.length) return;
    ctx.moveTo(a.points[0].x, a.points[0].y); a.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    if (a.points.length === 1) { ctx.arc(a.points[0].x, a.points[0].y, a.width / 2, 0, Math.PI * 2); ctx.fill(); return; }
  }
  ctx.stroke();
}
function canvas(width: number, height: number) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  // Keep cached surfaces in CPU memory to avoid full 4K GPU readbacks when masking/exporting.
  c.getContext('2d', { willReadFrequently: true }); return c;
}
export class Renderer {
  private composite: HTMLCanvasElement;
  private blurred: HTMLCanvasElement;
  private mask: HTMLCanvasElement;
  private previous = new WeakMap<HTMLCanvasElement, Annotation[]>();
  constructor(private original: HTMLImageElement, private asset?: (id: string, width?: number, height?: number) => CanvasImageSource) {
    const { naturalWidth: width, naturalHeight: height } = original;
    this.composite = canvas(width, height);
    this.blurred = canvas(width, height); this.mask = canvas(width, height);
    const ctx = this.blurred.getContext('2d')!;
    // Extend edges before blur to avoid transparent/dark borders.
    const pad = 48, padded = canvas(width + pad * 2, height + pad * 2), p = padded.getContext('2d')!;
    p.drawImage(original, pad, pad);
    p.drawImage(original, 0, 0, width, 1, pad, 0, width, pad);
    p.drawImage(original, 0, height - 1, width, 1, pad, pad + height, width, pad);
    p.drawImage(padded, pad, 0, 1, padded.height, 0, 0, pad, padded.height);
    p.drawImage(padded, pad + width - 1, 0, 1, padded.height, pad + width, 0, pad, padded.height);
    ctx.filter = 'blur(12px)'; ctx.drawImage(padded, -pad, -pad); ctx.filter = 'none';
    padded.width = 0;
  }
  render(target: HTMLCanvasElement, annotations: Annotation[]) {
    this.renderComposite(annotations);
    const ctx = target.getContext('2d', { willReadFrequently: true })!;
    ctx.clearRect(0, 0, target.width, target.height); ctx.drawImage(this.composite, 0, 0);
  }
  private renderComposite(annotations: Annotation[]) {
    const target = this.composite;
    for (const a of annotations) if (a.type === 'image') { if (!this.asset) throw new Error('Missing image assets.'); this.asset(a.assetId, a.width, a.height); }
    const previous = this.previous.get(target);
    let x = 0, y = 0, width = target.width, height = target.height;
    if (previous) {
      const changed = [...previous.filter((a, i) => annotations[i] !== a), ...annotations.filter((a, i) => previous[i] !== a)];
      if (!changed.length) return;
      // Leave room around round joins: a tight Canvas clip can change stroke rasterization.
      const boxes = changed.map(a => annotationBounds(a, a.type === 'freehand' || a.type === 'arrow' ? Math.max(2, a.width * 2) : 2));
      x = Math.max(0, Math.floor(Math.min(...boxes.map(b => b.x))));
      y = Math.max(0, Math.floor(Math.min(...boxes.map(b => b.y))));
      width = Math.min(target.width, Math.ceil(Math.max(...boxes.map(b => b.right)))) - x;
      height = Math.min(target.height, Math.ceil(Math.max(...boxes.map(b => b.bottom)))) - y;
    }
    this.previous.set(target, [...annotations]);
    if (width <= 0 || height <= 0) return;
    const ctx = target.getContext('2d', { willReadFrequently: true })!;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
    ctx.clearRect(x, y, width, height); ctx.drawImage(this.original, x, y, width, height, x, y, width, height);
    const blur = annotations.filter(a => a.type === 'blurStroke');
    if (blur.length) {
      const m = this.mask.getContext('2d')!; m.save(); m.beginPath(); m.rect(x, y, width, height); m.clip(); m.clearRect(x, y, width, height);
      m.globalCompositeOperation = 'source-over'; blur.forEach(a => paint(m, a));
      m.globalCompositeOperation = 'source-in'; m.drawImage(this.blurred, x, y, width, height, x, y, width, height); m.restore();
      ctx.drawImage(this.mask, x, y, width, height, x, y, width, height);
    }
    annotations.filter(a => a.type !== 'blurStroke').forEach(a => paint(ctx, a, undefined, this.asset));
    ctx.restore();
  }
  invalidate(_target: HTMLCanvasElement) { this.previous.delete(this.composite); }
  export(annotations: Annotation[]) {
    this.renderComposite(annotations);
    return this.composite.toDataURL('image/png');
  }
  dispose() { this.composite.width = 0; this.blurred.width = 0; this.mask.width = 0; }
}
