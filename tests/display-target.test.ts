import { expect, it } from 'vitest';
import { resolveDisplay, validateCaptureRequest } from '../electron/display-target';
const displays = [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }, { id: 2, bounds: { x: -1920, y: -116, width: 1920, height: 1200 } }];
it('explicit target wins over cursor and cursor target respects negative origins', () => {
  expect(resolveDisplay({ mode: 'full', target: { kind: 'display', displayId: 2 } }, displays, { x: 100, y: 100 }).id).toBe(2);
  expect(resolveDisplay({ mode: 'region', target: { kind: 'cursor' } }, displays, { x: -100, y: 20 }).id).toBe(2);
  expect(resolveDisplay({ mode: 'full', target: { kind: 'cursor' } }, displays, { x: 0, y: 20 }).id).toBe(1);
});
it('rejects disconnected IDs and malformed payloads instead of falling back', () => {
  expect(() => resolveDisplay({ mode: 'full', target: { kind: 'display', displayId: 3 } }, displays, { x: 0, y: 0 })).toThrow('disconnected');
  for (const payload of [null, 'full', { mode: 'full' }, { mode: 'full', target: { kind: 'display', displayId: '2' } }]) expect(validateCaptureRequest(payload)).toBe(false);
});
