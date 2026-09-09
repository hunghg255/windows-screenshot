import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
test('native global hotkeys target the cursor display while another process has focus', async () => {
  test.setTimeout(90000);
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), SCREENSHOT_TEST_USER_DATA: await mkdtemp(join(tmpdir(), 'screenshot-native-')) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.SCREENSHOT_EXECUTABLE, args: process.env.SCREENSHOT_EXECUTABLE ? [] : [resolve('.')], env });
  const cursor = await app.evaluate(({ screen }) => screen.getCursorScreenPoint());
  const helper = resolve('tests/e2e/native-hotkey.ps1');
  try {
    const settings = await app.firstWindow(); await expect(settings.getByLabel('Capture display')).toBeEnabled();
    const registered = await settings.evaluate(() => window.screenshot.updateShortcuts({ full: 'Ctrl+Alt+Shift+F23', region: 'Ctrl+Alt+Shift+F24' })); expect(registered.ok).toBe(true);
    const displays = await app.evaluate(({ screen }) => screen.getAllDisplays().map(d => ({ id: d.id, bounds: d.bounds })));
    test.skip(displays.length < 2, 'Requires two physical displays.');
    for (const display of displays.slice(0, 2)) for (const key of [134, 135]) {
      const next = app.waitForEvent('window');
      void next.catch(() => {});
      const injection = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-X', String(display.bounds.x + 200), '-Y', String(display.bounds.y + 200), '-VirtualKey', String(key)], { windowsHide: true });
      expect(JSON.parse(injection.stdout).injected).toBe(true);
      expect(JSON.parse(injection.stdout).foregroundProcess).not.toBe(app.process().pid);
      const capture = await next;
      if (key === 134) await expect(capture.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
      else await expect(capture.getByText('Drag to select')).toBeVisible();
      await expect.poll(() => capture.evaluate(async () => { const r = await window.screenshot.current(); return r.ok ? r.value?.displayId : null; })).toBe(display.id);
      if (key === 135) expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#region'))!.getBounds())).toEqual(display.bounds);
      const closed = capture.waitForEvent('close'); await capture.keyboard.press('Escape').catch(error => { if (!capture.isClosed()) throw error; }); await closed;
    }
  } finally {
    await app.close();
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-X', String(cursor.x), '-Y', String(cursor.y)], { windowsHide: true });
  }
});
