import { defineConfig } from 'mygo-cli';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  name: 'Screenshot',
  identifier: 'local.windows.screenshot',
  version: pkg.version,
  icon: 'assets/logo.png',
  main: './desktop',
  // `mygo dev` runs devCommand and loads devUrl; `mygo build` runs
  // buildCommand and embeds frontendDist into the app.
  devUrl: 'http://127.0.0.1:5173',
  devCommand: 'pnpm run dev:web',
  buildCommand: 'pnpm run build:web',
  frontendDist: 'dist',
  bindings: 'src/mygo.ts',
  out: 'build',
});
