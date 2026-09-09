# Repository Guidelines

## Project Structure & Module Organization

This Windows screenshot and annotation app uses Electron, React, and TypeScript.

- `electron/`: capture, global shortcuts, settings, image output, and the preload bridge.
- `shared/`: typed IPC contracts and coordinate validation.
- `src/`: React interface; `editor/` holds annotation models, hit testing, and Canvas rendering; `stores/editor.ts` owns Zustand state; `components/ui/` contains reusable UI components.
- `tests/`: Vitest unit tests; `tests/e2e/`: Playwright integration tests.
- `assets/`: application icons; `scripts/`: development, installation, and icon utilities.
- `dist/`, `dist-electron/`, and `release/`: generated build outputs; do not edit manually.

## Build, Test, and Development Commands

Use Windows x64, Node.js 22.12+, and pnpm 8.15.9. Substitute `pnpm.cmd` if PowerShell blocks `pnpm.ps1`.

- `pnpm install --frozen-lockfile`: install pinned dependencies and Electron.
- `pnpm dev`: compile Electron and start the app with Vite; restart after main/preload changes.
- `pnpm typecheck`: check renderer, shared, and Electron TypeScript.
- `pnpm test`: run Vitest unit tests.
- `pnpm test -- tests/geometry.test.ts`: run one test file.
- `pnpm build`: typecheck and build both application layers.
- `pnpm test:e2e`: build and run Playwright tests.
- `pnpm dist`: build an unsigned Windows x64 NSIS installer in `release/`.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, and adjacent-file formatting. Application modules generally use single quotes and semicolons. Name React components in PascalCase, functions and variables in camelCase, and utility modules in lowercase or kebab-case. Use Zustand selectors for shared application state. Keep native operations in Electron and typed bridge contracts in `shared/`. No dedicated formatter or lint script is configured.

## Testing Guidelines

Name unit tests `tests/*.test.ts` and integration tests `tests/e2e/*.spec.ts`. Add regression coverage for changed behavior, especially coordinate conversion, annotations, shortcuts, and export. No numeric coverage threshold is configured. Run typechecking and unit tests before review; run E2E tests for integration changes. E2E requires an unlocked Windows desktop and modifies the clipboard. Native save-dialog interaction needs manual verification.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout. Use concise imperative commit subjects; recommended examples are `fix: clamp capture bounds` and `feat: add annotation tool`. PRs should describe behavior changes, link relevant issues, report validation, and include screenshots for UI changes.

## Privacy & Configuration

Keep captures in memory until explicit copy/save. Never log or upload image data. Preserve the narrow preload API; do not expose generic filesystem or command execution access.
