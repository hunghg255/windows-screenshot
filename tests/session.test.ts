import { expect, it } from 'vitest';
import { CaptureSession } from '../electron/session';
it('rejects overlap and stale operations after cancel or replacement', () => {
  const session = new CaptureSession(); expect(session.begin('a')).toBe(true); expect(session.begin('b')).toBe(false);
  expect(session.matches('a')).toBe(true); session.end(); expect(session.matches('a')).toBe(false);
  session.begin('b'); expect(session.matches('a')).toBe(false); expect(session.matches('b')).toBe(true);
});
