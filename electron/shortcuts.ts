import type { Shortcuts } from '../shared/contracts';
export const defaults: Shortcuts = { full: 'Ctrl+Alt+F', region: 'Ctrl+Alt+R' };
export function validateShortcuts(value: unknown): value is Shortcuts {
  if (!value || typeof value !== 'object') return false;
  const s = value as Shortcuts;
  const valid = (v: unknown) => typeof v === 'string' && /^(?:(?:Ctrl|Alt|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|PrintScreen)$/.test(v) && new Set(v.split('+')).size === v.split('+').length;
  const canonical = (v: string) => v.split('+').sort().join('+');
  return valid(s.full) && valid(s.region) && canonical(s.full) !== canonical(s.region);
}
export interface Registry { register(key: string, callback: () => void): boolean; unregister(key: string): void }
export function replaceShortcuts(registry: Registry, old: Shortcuts | null, next: Shortcuts, callbacks: Record<keyof Shortcuts, () => void>): void {
  if (!validateShortcuts(next)) throw new Error('Use two different shortcuts with a modifier and a letter, number or function key.');
  if (old) Object.values(old).forEach(key => registry.unregister(key));
  const added: string[] = [];
  try {
    for (const mode of ['full', 'region'] as const) {
      if (!registry.register(next[mode], callbacks[mode])) throw new Error(`Shortcut ${next[mode]} is already in use.`);
      added.push(next[mode]);
    }
  } catch (error) {
    added.forEach(key => registry.unregister(key));
    const failed: string[] = [];
    if (old) for (const mode of ['full', 'region'] as const) if (!registry.register(old[mode], callbacks[mode])) failed.push(old[mode]);
    if (failed.length) throw new Error(`Could not restore ${failed.join(', ')}. Open Settings and choose available shortcuts.`);
    throw error;
  }
}
