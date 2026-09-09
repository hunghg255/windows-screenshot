import { arrowHead, type Annotation } from './model';
import { glyphFont, measureGlyph } from './glyph-layout';
import { transformBox, type Box } from './transform';
export function paint(ctx: CanvasRenderingContext2D, a: Annotation, override?: string) {
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
  } else if (a.type === 'arrow') {
    ctx.moveTo(a.start.x, a.start.y); ctx.lineTo(a.end.x, a.end.y);
    arrowHead(a.start, a.end, a.width).forEach(p => { ctx.moveTo(a.end.x, a.end.y); ctx.lineTo(p.x, p.y); });
  } else if (a.type === 'rectangle') ctx.rect(a.start.x, a.start.y, a.end.x - a.start.x, a.end.y - a.start.y);
  else ctx.arc((a.start.x + a.end.x) / 2, (a.start.y + a.end.y) / 2, Math.abs(a.end.x - a.start.x) / 2, 0, Math.PI * 2);
  ctx.stroke();
}
function canvas(width: number, height: number) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  // Keep cached surfaces in CPU memory to avoid full 4K GPU readbacks when masking/exporting.
  c.getContext('2d', { willReadFrequently: true }); return c;
}
export function annotationBounds(a: Annotation, padding = 2): Box {
  if ('transform' in a && a.transform) { const b = transformBox(annotationBounds({ ...a, transform: undefined }, 0), a.transform); return { x: b.x - padding, y: b.y - padding, right: b.right + padding, bottom: b.bottom + padding }; }
  if (a.type === 'text' || a.type === 'emoji') { const b = measureGlyph(a).bounds, delta = padding - 2; return { x: b.x - delta, y: b.y - delta, right: Math.max(b.right - 2, b.x + 4) + padding, bottom: b.bottom + delta }; }
  const points = 'points' in a ? a.points : a.type === 'arrow' ? [a.start, a.end, ...arrowHead(a.start, a.end, a.width)] : [a.start, a.end];
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of points) { x = Math.min(x, p.x); y = Math.min(y, p.y); right = Math.max(right, p.x); bottom = Math.max(bottom, p.y); }
  const pad = a.width / 2 + padding;
  return { x: x - pad, y: y - pad, right: right + pad, bottom: bottom + pad };
}
export class Renderer {
  private blurred: HTMLCanvasElement;
  private mask: HTMLCanvasElement;
  private previous = new WeakMap<HTMLCanvasElement, Annotation[]>();
  constructor(private original: HTMLImageElement) {
    const { naturalWidth: width, naturalHeight: height } = original;
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
    const previous = this.previous.get(target);
    let x = 0, y = 0, width = target.width, height = target.height;
    if (previous) {
      const changed = [...previous.filter((a, i) => annotations[i] !== a), ...annotations.filter((a, i) => previous[i] !== a)];
      if (!changed.length) return;
      const boxes = changed.map(a => annotationBounds(a));
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
    annotations.filter(a => a.type !== 'blurStroke').forEach(a => paint(ctx, a));
    ctx.restore();
  }
  invalidate(target: HTMLCanvasElement) { this.previous.delete(target); }
  export(annotations: Annotation[]) {
    const c = canvas(this.original.naturalWidth, this.original.naturalHeight); this.render(c, annotations);
    const png = c.toDataURL('image/png'); c.width = 0; return png;
  }
  dispose() { this.blurred.width = 0; this.mask.width = 0; }
}
