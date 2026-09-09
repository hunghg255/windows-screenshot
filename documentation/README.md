# Screenshot landing page

Bilingual Vietnamese/English product landing page built with Vite, React and TypeScript. The header language selector switches all page copy, image descriptions, accessibility labels, document language, title, and meta description. Each page load defaults to Vietnamese; the actual app screenshots retain their original contents. Translations live in `src/i18n.ts`.

From this directory, using Node.js 22.12+ and pnpm 8.15.9:

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm preview
```

The production output is `dist/`. Relative asset paths support hosting at a domain root or a subdirectory, including GitHub Pages. No Electron runtime is needed.

If the repository dependencies are already installed, you can also run from the repository root without a separate installation:

```powershell
pnpm exec vite documentation --config documentation/vite.config.ts
pnpm exec tsc --noEmit -p documentation/tsconfig.json
pnpm exec vite build documentation --config documentation/vite.config.ts
```

GitHub and download destinations are defined in `src/main.tsx`. Download buttons open the repository's Releases page so visitors can select an available Windows installer. The gallery displays actual Electron screenshots, with links to the original PNGs. The font loads from Google Fonts, with a local sans-serif fallback.

### Refresh the app screenshots

From the repository root, run `pnpm build:electron` then `node documentation/scripts/capture-app.cjs` on Windows. This launches an isolated Electron session and writes three screenshots to `public/screenshots/`. The editor receives a screenshot of the app's settings window through a test-only IPC fixture; annotations are made with the real app controls. No desktop contents or personal conversations are captured. Production application code is unchanged.
