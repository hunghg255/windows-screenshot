import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { loadSettings, persistSettings } from '../electron/settings';
it('falls back for corrupted configuration and persists Unicode folders through restart', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'screenshot-settings-')), 'settings.json');
  expect((await loadSettings(path)).warning).toBe('');
  await writeFile(path, '{broken'); expect((await loadSettings(path)).warning).toContain('unreadable');
  const settings = { shortcuts: { full: 'Ctrl+J', region: 'Ctrl+K' }, lastDirectory: 'D:\\Ảnh chụp' };
  await persistSettings(path, settings); expect((await loadSettings(path)).settings).toEqual(settings);
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(settings);
});
