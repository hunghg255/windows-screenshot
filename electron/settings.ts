import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Settings } from '../shared/contracts';
import { defaults, validateShortcuts } from './shortcuts';
export async function loadSettings(path: string): Promise<{ settings: Settings; warning: string }> {
  try {
    const data = JSON.parse(await readFile(path, 'utf8')) as Settings;
    if (!validateShortcuts(data.shortcuts) || (data.lastDirectory !== undefined && typeof data.lastDirectory !== 'string')) throw new Error('Invalid configuration');
    return { settings: { shortcuts: data.shortcuts, lastDirectory: data.lastDirectory }, warning: '' };
  } catch (error) {
    return { settings: { shortcuts: { ...defaults } }, warning: (error as NodeJS.ErrnoException).code === 'ENOENT' ? '' : 'Configuration was unreadable. Default shortcuts restored.' };
  }
}
export async function persistSettings(path: string, settings: Settings) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.new`, JSON.stringify(settings, null, 2), 'utf8');
  await rename(`${path}.new`, path);
}
