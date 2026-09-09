import type { GlyphAnnotation } from './model';
export const normalizeText = (value: string) => value.replace(/\r\n?/g, '\n');
export function textError(value: string) {
  if (Array.from(value).length > 2000) return 'Use at most 2,000 characters.';
  if (normalizeText(value).split('\n').length > 20) return 'Use at most 20 lines.';
  return '';
}
export function glyphFont(a: GlyphAnnotation) { return a.type === 'text' ? `${a.fontSize}px "${a.fontFamily}"` : `${a.size}px "Segoe UI Emoji"`; }
type Metrics = Pick<TextMetrics, 'width' | 'actualBoundingBoxLeft' | 'actualBoundingBoxRight' | 'actualBoundingBoxAscent' | 'actualBoundingBoxDescent'>;
export function glyphLayout(a: GlyphAnnotation, measure: (line: string) => Metrics) {
  const size = a.type === 'text' ? a.fontSize : a.size;
  const lineHeight = a.type === 'text' ? a.lineHeight : 1.25;
  let x = a.position.x, y = a.position.y, right = x, bottom = y;
  const lines = (a.type === 'text' ? normalizeText(a.content).split('\n') : [a.content]).map((content, i) => {
    const baseline = a.position.y + size + i * size * lineHeight, m = measure(content);
    x = Math.min(x, a.position.x - m.actualBoundingBoxLeft);
    y = Math.min(y, baseline - m.actualBoundingBoxAscent);
    right = Math.max(right, a.position.x + m.width, a.position.x + m.actualBoundingBoxRight);
    bottom = Math.max(bottom, baseline + m.actualBoundingBoxDescent);
    return { content, x: a.position.x, baseline };
  });
  return { lines, bounds: { x: x - 2, y: y - 2, right: right + 2, bottom: bottom + 2 } };
}
let measuring: CanvasRenderingContext2D | null = null;
export function measureGlyph(a: GlyphAnnotation) {
  measuring ??= document.createElement('canvas').getContext('2d')!;
  measuring.font = glyphFont(a); measuring.textBaseline = 'alphabetic';
  return glyphLayout(a, line => measuring!.measureText(line));
}
export async function loadGlyphFonts() {
  await Promise.all([document.fonts.load('32px "Segoe UI"', 'Tiếng Việt'), document.fonts.load('48px "Segoe UI Emoji"', '😀👍👩‍💻')]);
  await document.fonts.ready;
}
