import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
test.use({ trace: 'off' });
for (const reverse of [false, true]) test(`native drag across connected screens (${reverse ? 'reverse' : 'forward'}) opens one cropped editor`, async ({}, info) => {
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), SCREENSHOT_TEST_USER_DATA: await mkdtemp(join(tmpdir(), 'screenshot-native-selection-')) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [resolve('.')], env });
  const original = await app.evaluate(({ screen }) => screen.dipToScreenPoint(screen.getCursorScreenPoint()));
  try {
    const settings = await app.firstWindow(); await expect(settings.getByRole('button', { name: 'Select region', exact: true })).toBeEnabled();
    const geometry = await app.evaluate(({ screen }, reverse) => {
      const ds = screen.getAllDisplays(), first = ds[0].bounds, last = ds[ds.length - 1].bounds;
      let start = { x: first.x + 100, y: first.y + 100 }, end = { x: last.x + last.width - 150, y: last.y + last.height - 150 };
      if (reverse) [start, end] = [end, start];
      const scale = Math.max(...ds.map(d => d.scaleFactor));
      return { displays: ds.map(d => ({ bounds: d.bounds, scale: d.scaleFactor })), start: screen.dipToScreenPoint(start), end: screen.dipToScreenPoint(end), width: Math.round(Math.abs(end.x - start.x) * scale), height: Math.round(Math.abs(end.y - start.y) * scale) };
    }, reverse);
    console.log('Native selection geometry:', JSON.stringify(geometry));
    await info.attach('physical-displays', { body: JSON.stringify(geometry), contentType: 'application/json' });
    await settings.getByRole('button', { name: 'Select region', exact: true }).click();
    await expect.poll(() => app.windows().filter(p => p.url().endsWith('#region')).length).toBe(geometry.displays.length);
    for (const page of app.windows().filter(p => p.url().endsWith('#region'))) await expect(page.getByAltText('Frozen screen capture')).toBeVisible();
    const opened = app.waitForEvent('window'); void opened.catch(() => {});
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve('tests/e2e/native-drag.ps1'), '-StartX', String(geometry.start.x), '-StartY', String(geometry.start.y), '-EndX', String(geometry.end.x), '-EndY', String(geometry.end.y)], { windowsHide: true });
    const editor = await opened; await expect(editor.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled();
    const size = await editor.evaluate(async () => { const r = await window.screenshot.current(); return r.ok && r.value ? { width: r.value.width, height: r.value.height } : null; });
    expect(size).toEqual({ width: geometry.width, height: geometry.height });
    expect(app.windows().filter(p => p.url().endsWith('#region'))).toHaveLength(0);
  } finally {
    await app.close();
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve('tests/e2e/native-hotkey.ps1'), '-X', String(original.x), '-Y', String(original.y)], { windowsHide: true });
  }
});
