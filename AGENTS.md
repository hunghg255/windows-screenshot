# Repository Guidelines

## Project Structure & Module Organization

This Windows screenshot and annotation app uses MyGo (Go with the system WebView2), React, and TypeScript.

- `desktop/`: the Go app (package main): Win32 capture, multi-display composite, windows, tray, global shortcuts, settings, image output, and the bound `Screenshot` service.
- `src/mygo.ts`: TypeScript client generated from `desktop/` by `mygo generate`; do not edit. `src/bridge.ts` adapts it to `window.screenshot`.
- `shared/`: typed renderer contracts and coordinate validation.
- `src/`: React interface; `editor/` holds annotation models, hit testing, and Canvas rendering; `stores/editor.ts` owns Zustand state; `components/ui/` contains reusable UI components.
- `tests/`: Vitest unit tests; `desktop/*_test.go`: Go unit tests.
- `assets/`: application icons; `scripts/`: development, installation, and icon utilities.
- `dist/`, `build/`, `.mygo/`, and `release/`: generated build outputs; do not edit manually.

## Build, Test, and Development Commands

Use Windows x64, Go 1.27+, Node.js 22.12+, and pnpm 8.15.9. Substitute `pnpm.cmd` if PowerShell blocks `pnpm.ps1`.

- `pnpm install --frozen-lockfile`: install pinned dependencies, including the `mygo` CLI.
- `pnpm dev`: run `mygo dev`: Vite plus the Go app, rebuilt and restarted on Go changes; regenerates `src/mygo.ts`.
- `pnpm generate`: regenerate `src/mygo.ts` after changing bound Go methods or events.
- `pnpm typecheck`: check renderer and shared TypeScript.
- `pnpm test`: run Vitest and `go test ./desktop`.
- `pnpm test -- tests/geometry.test.ts`: run one test file.
- `pnpm build`: typecheck, then `mygo build`: `build/windows-amd64/Screenshot.exe` with the frontend embedded, and an unsigned NSIS installer.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, and adjacent-file formatting. Application modules generally use single quotes and semicolons. Name React components in PascalCase, functions and variables in camelCase, and utility modules in lowercase or kebab-case. Use Zustand selectors for shared application state. Keep native operations in Go (`desktop/`) and renderer contracts in `shared/`. Run `gofmt` on Go code. MyGo listeners (window events, menus, shortcuts) run on the main thread: never take `state.mu` in them; hand work to a goroutine. No dedicated formatter or lint script is configured.

## Testing Guidelines

Name unit tests `tests/*.test.ts` and Go tests `desktop/*_test.go`. Add regression coverage for changed behavior, especially coordinate conversion, annotations, shortcuts, and export. No numeric coverage threshold is configured. Run typechecking and unit tests before review. There is no automated E2E suite yet; verify capture, shortcuts, clipboard and dialogs manually in a `pnpm build` app.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout. Use concise imperative commit subjects; recommended examples are `fix: clamp capture bounds` and `feat: add annotation tool`. PRs should describe behavior changes, link relevant issues, report validation, and include screenshots for UI changes.

## Privacy & Configuration

Keep captures in memory until explicit copy/save. Never log or upload image data. Preserve the narrow bound `Screenshot` service; do not expose generic filesystem or command execution access, and check the caller window's role in every method.
