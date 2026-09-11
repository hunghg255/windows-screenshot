import type { Point } from '../../shared/contracts';
export type Tool = 'select' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'freehand' | 'blurStroke' | 'text' | 'emoji';
export type Transform = { x: number; y: number; sx: number; sy: number };
type Base = { id: string; width: number; transform?: Transform; rotation?: number };
export type Drawing = (Base & { type: 'line' | 'arrow' | 'rectangle' | 'circle'; color: string; start: Point; end: Point }) | (Base & { type: 'freehand'; color: string; points: Point[] }) | (Base & { type: 'blurStroke'; points: Point[] });
export type TextAnnotation = { id: string; type: 'text'; position: Point; content: string; color: string; fontFamily: 'Segoe UI'; fontSize: number; lineHeight: number; rotation?: number };
export type EmojiAnnotation = { id: string; type: 'emoji'; position: Point; content: string; size: number; rotation?: number };
export type GlyphAnnotation = TextAnnotation | EmojiAnnotation;
export type ImageAnnotation = { id: string; type: 'image'; assetId: string; position: Point; width: number; height: number; rotation?: number };
export type Annotation = Drawing | GlyphAnnotation | ImageAnnotation;
export function shapeEnd(start: Point, end: Point, square: boolean, size: { width: number; height: number }): Point {
  if (!square) return end;
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), dx < 0 ? start.x : size.width - start.x, dy < 0 ? start.y : size.height - start.y);
  return { x: start.x + (dx < 0 ? -length : length), y: start.y + (dy < 0 ? -length : length) };
}
export function arrowHead(start: Point, end: Point, width: number): Point[] {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const length = Math.min(Math.hypot(end.x - start.x, end.y - start.y) * .6, Math.max(12, width * 3));
  return [-Math.PI / 6, Math.PI / 6].map(offset => ({ x: end.x - length * Math.cos(angle + offset), y: end.y - length * Math.sin(angle + offset) }));
}
export function nonEmpty(a: Annotation) { return a.type === 'image' ? a.width > 0 && a.height > 0 : 'content' in a ? !!a.content.trim() : 'points' in a ? a.points.length > 0 : Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y) >= 2; }
