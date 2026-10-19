# Repository Guidelines

## Project Structure & Module Organization

This Windows screenshot and annotation app uses myzig (Zig with the system WebView2), React, and TypeScript.

- `desktop/`: the Zig app: `main.zig` (state, windows, capture flow, tray), `service.zig` (the bound `Screenshot` service), `win32.zig` (GDI capture, displays, global shortcuts, overlays), `geometry.zig`, `image.zig` (composite, PNG), `settings.zig`.
- `src/myzig.js`, `src/myzig.d.ts`: client generated from `desktop/` by `myzig generate`; do not edit. `src/bridge.ts` adapts it to `window.screenshot` and turns Zig error names into messages.
- `shared/`: typed renderer contracts and coordinate validation.
- `src/`: React interface; `editor/` holds annotation models, hit testing, and Canvas rendering; `stores/editor.ts` owns Zustand state; `components/ui/` contains reusable UI components.
- `tests/`: Vitest unit tests; `test` blocks in `desktop/*.zig` (listed in `desktop/tests.zig`).
- `assets/`: application icons; `scripts/`: development, installation, and icon utilities.
- `dist/` (with `myzig_assets.zig`), `build/`, `.myzig/`, `.zig-cache/`, `zig-out/` and `release/`: generated build outputs; do not edit manually.

## Build, Test, and Development Commands

Use Windows x64, Zig 0.17.0, Node.js 22.12+, and pnpm 8.15.9, with myzig checked out at `../myzig` and its CLI (`myzig`) on the `PATH`. Substitute `pnpm.cmd` if PowerShell blocks `pnpm.ps1`.

- `pnpm install --frozen-lockfile`: install pinned frontend dependencies.
- `pnpm dev`: run `myzig dev`: Vite plus the Zig app, rebuilt and restarted on Zig changes; regenerates `src/myzig.{js,d.ts}`.
- `pnpm generate`: regenerate `src/myzig.{js,d.ts}` after changing bound Zig methods or events.
- `pnpm typecheck`: check renderer and shared TypeScript.
- `pnpm test`: run Vitest and `zig build test`.
- `pnpm test -- tests/geometry.test.ts`: run one test file.
- `pnpm build`: typecheck, then `myzig build`: `build/windows-x86_64/` with the frontend embedded in the executable, and an unsigned NSIS installer.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, and adjacent-file formatting. Application modules generally use single quotes and semicolons. Name React components in PascalCase, functions and variables in camelCase, and utility modules in lowercase or kebab-case. Use Zustand selectors for shared application state. Keep native operations in Zig (`desktop/`) and renderer contracts in `shared/`. Run `zig fmt` on Zig code. Bound methods, page events, timers, tray clicks and shortcuts all run on the main thread, so state needs no locks; modal dialogs run a nested loop, which the busy flags guard. Close windows from timers (`State.later`), not from their own callbacks. A new error a page can see needs its message in `src/bridge.ts`. No dedicated formatter or lint script is configured.

## Testing Guidelines

Name unit tests `tests/*.test.ts`; Zig tests are `test` blocks in `desktop/`. Add regression coverage for changed behavior, especially coordinate conversion, annotations, shortcuts, and export. No numeric coverage threshold is configured. Run typechecking and unit tests before review. There is no automated E2E suite yet; verify capture, shortcuts, clipboard and dialogs manually in a `pnpm build` app.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout. Use concise imperative commit subjects; recommended examples are `fix: clamp capture bounds` and `feat: add annotation tool`. PRs should describe behavior changes, link relevant issues, report validation, and include screenshots for UI changes.

## Privacy & Configuration

Keep captures in memory until explicit copy/save. Never log or upload image data. Preserve the narrow bound `Screenshot` service; do not expose generic filesystem or command execution access, and check the caller window's role in every method.
