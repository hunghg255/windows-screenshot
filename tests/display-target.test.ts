import { expect, it } from 'vitest';
import { validateCaptureRequest } from '../electron/display-target';
it('accepts only whole-desktop capture modes', () => {
  expect(validateCaptureRequest({ mode: 'full' })).toBe(true);
  expect(validateCaptureRequest({ mode: 'region' })).toBe(true);
  for (const value of [null, 'full', {}, { mode: 'other' }, { mode: 'full', target: { kind: 'cursor' } }]) expect(validateCaptureRequest(value)).toBe(false);
});
