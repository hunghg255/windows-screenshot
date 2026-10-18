import type { CaptureRequest } from '../shared/contracts';
export function validateCaptureRequest(value: unknown): value is CaptureRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as CaptureRequest;
  return (r.mode === 'full' || r.mode === 'region') && !('target' in r);
}
