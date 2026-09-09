const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

// Electron 44 exposes an explicit installer. Windows' built-in ZIP extractor also
// works on machines missing a DLL required by Electron's native ZIP helper.
async function install() {
  const packagePath = require.resolve('electron/package.json');
  const directory = dirname(packagePath);
  const { version } = require(packagePath);
  const executable = process.platform === 'win32' ? 'electron.exe' : 'electron';
  const versionPath = join(directory, 'dist/version');
  if (existsSync(join(directory, 'dist', executable)) && existsSync(versionPath) && readFileSync(versionPath, 'utf8').trim().replace(/^v/, '') === version) {
    writeFileSync(join(directory, 'path.txt'), executable); return;
  }
  if (process.platform !== 'win32') {
    const result = spawnSync(process.execPath, [join(directory, 'install.js')], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Electron installation failed.'); return;
  }
  const electronRequire = createRequire(packagePath);
  const { downloadArtifact } = electronRequire('@electron/get');
  const zip = await downloadArtifact({ version, artifactName: 'electron', platform: 'win32', arch: process.arch, checksums: require(join(directory, 'checksums.json')) });
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:SCREENSHOT_ELECTRON_ZIP -DestinationPath $env:SCREENSHOT_ELECTRON_DIST -Force'], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, SCREENSHOT_ELECTRON_ZIP: zip, SCREENSHOT_ELECTRON_DIST: join(directory, 'dist') },
  });
  if (result.status !== 0 || !existsSync(join(directory, 'dist/electron.exe'))) throw new Error('Electron extraction failed.');
  writeFileSync(join(directory, 'path.txt'), 'electron.exe');
}
install().catch(error => { console.error(error); process.exitCode = 1; });
