import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import electron from 'electron';

// A shared cache can belong to a different Windows account (for example sandbox
// tooling), which prevents Vite from replacing deps after a config change.
const cacheRoot = resolve(tmpdir());
const cacheDir = await mkdtemp(join(cacheRoot, 'screenshot-vite-dev-'));
let server;
try {
  server = await createServer({ cacheDir });
  await server.listen();
  const env = { ...process.env, SCREENSHOT_DEV_URL: 'http://127.0.0.1:5173' };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, ['.'], { stdio: 'inherit', env });
  const stop = () => child.kill();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('exit', code => resolve(code ?? 0));
      child.once('error', reject);
    });
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
} finally {
  await server?.close();
  const target = resolve(cacheDir);
  if (dirname(target) !== cacheRoot || !basename(target).startsWith('screenshot-vite-dev-')) throw new Error('Unexpected Vite cache path.');
  await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(error => {
    console.warn(`Could not remove temporary Vite cache: ${error.message}`);
  });
}
