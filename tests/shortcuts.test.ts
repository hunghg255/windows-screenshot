import { describe, expect, it } from 'vitest';
import { defaults, replaceShortcuts, validateShortcuts } from '../electron/shortcuts';
describe('shortcut transaction', () => {
  it('rejects duplicates including modifier reordering and malformed accelerators', () => {
    expect(validateShortcuts({ full: 'Ctrl+Alt+F', region: 'Alt+Ctrl+F' })).toBe(false);
    expect(validateShortcuts({ full: 'F', region: 'Ctrl+R' })).toBe(false);
    expect(validateShortcuts({ full: 'Ctrl+Ctrl+F', region: 'Ctrl+R' })).toBe(false);
    expect(validateShortcuts(defaults)).toBe(true);
  });
  it('restores both old registrations when the second new key conflicts', () => {
    const registered = new Set(Object.values(defaults));
    const registry = { register(key: string) { if (key === 'Alt+X' || registered.has(key)) return false; registered.add(key); return true; }, unregister(key: string) { registered.delete(key); } };
    expect(() => replaceShortcuts(registry, defaults, { full: 'Ctrl+J', region: 'Alt+X' }, { full() {}, region() {} })).toThrow('already in use');
    expect([...registered].sort()).toEqual(Object.values(defaults).sort());
  });
  it('allows swapping the two registered shortcuts', () => {
    const keys = new Set(Object.values(defaults));
    replaceShortcuts({ register(key) { if (keys.has(key)) return false; keys.add(key); return true; }, unregister(key) { keys.delete(key); } }, defaults, { full: defaults.region, region: defaults.full }, { full() {}, region() {} });
    expect(keys.size).toBe(2);
  });
});
