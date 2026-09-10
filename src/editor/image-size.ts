import type { ImageAnnotation } from './model';
import { annotationBounds, boxCenter, frameBounds } from './transform';
import { validateImageSize } from '../../shared/image-import';
export function setImageSize(a: ImageAnnotation, axis: 'width' | 'height', value: number, locked: boolean, canvas: { width: number; height: number }): ImageAnnotation {
  const scale = value / a[axis];
  const width = axis === 'width' ? value : locked ? a.width * scale : a.width;
  const height = axis === 'height' ? value : locked ? a.height * scale : a.height;
  validateImageSize(width, height);
  if (width < 2 || height < 2) throw new Error('Image dimensions must be at least 2 px.');
  const center = boxCenter(frameBounds(a));
  const next = { ...a, width, height, position: { x: center.x - width / 2, y: center.y - height / 2 } };
  const old = annotationBounds(a, 0), bounds = annotationBounds(next, 0);
  if ((old.x >= -1e-7 && old.right <= canvas.width + 1e-7 && (bounds.x < -1e-7 || bounds.right > canvas.width + 1e-7)) || (old.y >= -1e-7 && old.bottom <= canvas.height + 1e-7 && (bounds.y < -1e-7 || bounds.bottom > canvas.height + 1e-7))) throw new Error('That size would extend beyond the screenshot.');
  return next;
}
