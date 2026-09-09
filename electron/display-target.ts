import type { CaptureRequest, Point, Rect } from '../shared/contracts';
export function validateCaptureRequest(value: unknown): value is CaptureRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as CaptureRequest;
  return (r.mode === 'full' || r.mode === 'region') && !!r.target &&
    (r.target.kind === 'cursor' || (r.target.kind === 'display' && Number.isSafeInteger(r.target.displayId)));
}
export function resolveDisplay<T extends { id: number; bounds: Rect }>(request: CaptureRequest, displays: T[], cursor: Point): T {
  if (!validateCaptureRequest(request)) throw new Error('Invalid capture request.');
  if (request.target.kind === 'display') {
    const id = request.target.displayId, display = displays.find(d => d.id === id);
    if (!display) throw new Error('The selected display was disconnected. Choose a connected display.');
    return display;
  }
  const display = displays.find(({ bounds: b }) => cursor.x >= b.x && cursor.x < b.x + b.width && cursor.y >= b.y && cursor.y < b.y + b.height);
  if (!display) throw new Error('The cursor is outside the connected displays. Move it onto a display and try again.');
  return display;
}
