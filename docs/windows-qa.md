# Windows validation — 2026-09-09

Source: `.agents/plans/windows-screenshot/task.md` and `todo.md`. The implementation request authorizes the planned MVP and replaces npm with **pnpm**. No cloud, OCR, undo/redo, history, or cross-display region capture was added.

## Environment

- Windows **10 build 19045 x64**, Node 24.21.0, pnpm 8.15.9.
- Intel Core i5-1145G7 @ 2.60 GHz.
- Display 1: 1920×1080, origin (0, 0), 100% DPI.
- Display 2: 1920×1200, origin (-1920, -116), 100% DPI.
- Electron 44.3.0, React 19.2.8, Vite 8.2.2, Tailwind 4.3.3, Zustand 5.0.15; exact versions and pnpm lockfile.

Windows 11 was the proposed acceptance platform, but is not the OS available here. The original baseline only inventoried the second display; the 0.2.0 update below adds actual capture and native hotkey verification on both displays.

## Automated results

| Check | Evidence |
| --- | --- |
| Typecheck + production build | Passed, main/preload and renderer |
| Vitest | 8 files, 19 tests passed |
| Actual full/region capture | Passed in production Electron; native capture, not browser mocks |
| Coordinate math | Four drag directions, clamping, negative display origin, 100/125/150/200% ratios |
| Editor | Arrow, rectangle, circle, freehand, blur drawn through Pointer Events |
| Clipboard | Actual Windows PNG clipboard; decoded pixel hash matches saved PNG |
| Save | Real encoder/IPC/filesystem, Unicode filename, dialog-cancel keeps image; only native chooser substituted |
| Session lifecycle | 30 real capture/editor/Escape cycles; exactly one Settings window after every close |
| Shortcut registration | Actual Electron registration conflict rolls back; changed settings survive process restart |
| Capture fallback | Deliberately undersized thumbnail triggers actual isolated desktop-frame capture; frame reader is destroyed |
| Blur pixels | Original outside mask; overlap does not compound blur; colored annotations above blur; deleting blur restores original |
| Export | 3840×2160 synthetic fixture retains size and matches blur preview pixels |
| Dev UI | Vite + Electron Settings loaded and styled; isolated test server avoids an existing dev port |
| Security | Restricted bridge, renderer has no require, stale session output rejected |
| Packaged executable | All 4 screenshot E2E tests passed against `release/windows-x64/win-unpacked/Screenshot.exe`, without Vite |

The frame fallback changes the source thumbnail size in the test, but still captures a real desktop frame through Electron. It is not a fabricated screenshot backend.

## 4K performance and memory

The first implementation measured **92.7 ms p95**. Dirty rectangles plus CPU-backed cached canvases reduced the final measured Canvas render/readback p95 to **2.7 ms** (an earlier optimized run measured 6.3 ms). The fixture is 3840×2160, a moving 80-pixel blur stroke, 5 warm-up updates and 60 measured updates. This measures renderer work plus a pixel readback, not full end-to-end pointer-to-display latency, and does not claim a physical 4K monitor test.

After capture cycles 1 / 10 / 20 / 30, total Electron working set was **407484 / 437100 / 466824 / 472424 KB**. Window count returned to one every time. Growth slowed over this run; this is observational evidence, not proof that every driver/GPU configuration is leak-free.

The same 30-cycle check on the final packaged executable measured **435276 / 486752 / 489440 / 493776 KB**, again with one remaining Settings window at every checkpoint.

Test artifacts are written under ignored `test-results/`. They may contain desktop screenshots, so they are intentionally excluded from source control and packaging.

## Packaging

The NSIS Windows x64 configuration uses `assets/logo.png` for the installer/executable and preserves the existing tray `assets/icon.ico`. It reuses the pinned runtime installed by `pnpm install`; this avoids redundant downloads and native extraction issues observed on this Windows machine. Installer output: `release/windows-x64/`.

Run the packaged application smoke with:

```powershell
$env:SCREENSHOT_EXECUTABLE = (Resolve-Path 'release/windows-x64/win-unpacked/Screenshot.exe').Path
pnpm exec playwright test tests/e2e/screenshot.spec.ts
Remove-Item Env:SCREENSHOT_EXECUTABLE
```

The artifact is unsigned. This original MVP evidence predates the GitHub release workflow below; signing remains outside scope.

Final installer: **Screenshot Setup 0.1.0.exe**, **114775432 bytes**. SHA-256: `DCC2E5D31FFBE628C394F6C7D9A4FDD1BEB4E2A896E5BD7D293DB962E4D51F9D`.

In this managed workspace, build ran in the sandbox and the equivalent final `pnpm exec electron-builder --win nsis --x64` step ran with permission to access packaging downloads. Intermediate attempts exposed Windows native ZIP-helper and output-directory rename problems; the committed postinstall and `electronDist` configuration avoid those redundant extraction paths. The final packaged executable passed its four desktop tests in 30.8 seconds.

## Manual acceptance still required

- Windows 11 installation/uninstallation and native NSIS wizard interaction.
- Rapid repeated native shortcut activation and second-instance focusing. Normal native hotkeys with another process focused on both physical displays are now verified in 0.2.0.
- Physical 125/150/200% DPI, mixed DPI, secondary-display region edges, physical 4K, HDR/protected content.
- Display unplug/resolution change while selection is active.
- Native Save chooser: cancel, overwrite confirmation, folder switching, denied write permissions and unavailable folder. Automated save integration does not replace these checks.
- Paste the clipboard into Paint and visually inspect. Automated clipboard pixel equality already passes.
- Manual resizing, Shift press/release mid-shape, Escape mid-stroke, selection/color/delete across overlapping objects, and perceived 4K responsiveness.

These items are deliberately not marked passed from mathematical tests or UI mocks. The original plan's task-level manual acceptance checkboxes remain open until that acceptance is performed.

## Text, Emoji and multiple displays — 0.2.0 update

Status: **needs review** (implementation complete; remaining physical/manual acceptance listed below). Source: approved Task 16–22 in the Windows screenshot plan.

- Settings now lists connected displays by label, resolution and position. Buttons and per-display tray menu actions use an explicit validated ID. Disconnected IDs fail instead of falling back. Hotkeys synchronously resolve the cursor display before hiding Settings or awaiting capture; topology changes refresh the list/tray and cancel active capture.
- Text supports multiline Vietnamese, Segoe UI, 12–160 original pixels, color, a 2,000-code-point/20-line limit, Done/Ctrl+Enter, draft cancellation, double-click editing, selection and deletion. Composition events do not commit text. Composer UI is excluded from exports.
- The offline 32-entry Emoji repertoire preserves complete Unicode strings, including variation selectors, skin tones and ZWJ sequences. A native Segoe UI Emoji color probe filters unsupported/monochrome entries. Placement, selection, size 16–256, deletion, keyboard picker navigation and staged Escape are implemented. No network or new font dependency is used.
- Text and Emoji share layout/bounds between rendering and hit testing; dirty rendering clears old glyph bounds. Electron pixel checks compare preview with fresh PNG export after edits, resize and deletion, and confirm restored background. A synthetic 3840×2160 fixture retained blur behavior with **3.60 ms p95** render/readback in the final full run; this is not a physical 4K latency measurement.
- `pnpm build` (including typecheck), **48 unit tests in 12 files**, and **8 desktop E2E tests** passed. Unit totals include the existing release-workflow tests. E2E verifies explicit capture A→B and B→A while Settings is on the opposite display, stale-ID rejection, and negative-origin region overlay/crop. Native user32 key injection verifies both full/region hotkeys with cursor on each display and another process foreground; the test restores the cursor and uses isolated shortcut settings.

- **All 7 packaged desktop tests passed** against `release/windows-x64-0.2.0/win-unpacked/Screenshot.exe` in 51.6 seconds, including the native hotkeys, both display directions, Text/Emoji, actual clipboard, save integration, fallback and 30 capture cycles. Working set at cycles 1/10/20/30: 415228 / 449452 / 488828 / 458292 KB; one Settings window remained after every close.
- New installer: [Screenshot-Setup-0.2.0-windows-x64.exe](../release/windows-x64-0.2.0/Screenshot-Setup-0.2.0-windows-x64.exe), 114778867 bytes. SHA-256: `E06AA13B8B3E0205210C8D707325648D9738874B7D9FBFB49F02EC6CBAA3FF38`. Packaging used `pnpm exec electron-builder --win nsis --x64 --publish never --config.directories.output=release/windows-x64-0.2.0` because Windows denied unlinking a file in the old output folder. This is a local unsigned build; nothing was published.

Remaining acceptance: native tray menu mouse interaction, actual unplug/resolution changes, physical mixed DPI/125–200%, Windows 11, native IME input via the OS, interactive installer wizard and native Save/Paint checks. The automated region test covers a secondary display with negative origin at 100% DPI; it does not establish mixed-DPI behavior. Dragging objects was outside the 0.2.0 scope and is implemented in 0.3.0 below; cross-display regions remain outside scope.

## Move and resize — 0.3.0 update

Source: approved Task 23–27. Status: **needs review** for outstanding hardware/manual acceptance; implementation and automated checks complete.

- Select and drag any annotation to move it; four corner and four edge handles resize arrows, rectangles, circles (including ellipses after resize), freehand strokes, blur masks, Text and Emoji. Drawing transforms scale geometry and stroke together. Text/Emoji resize uniformly with their existing size limits, retaining text content and Unicode sequences.
- Drag uses an immutable pointer-down snapshot, a small movement threshold and pointer capture. Release commits; Escape, pointer cancellation/lost capture, window blur or editor resize restores the snapshot. Conflicting actions are disabled during drag. Double-click Text editing remains available after transforms.
- Drawing paint, bounds and inverse hit testing use the same transform. Geometry bounds are separate from antialias padding. Selection handles use CSS pixels and a DOM overlay, so they are excluded from PNG/clipboard. Blur transforms only its mask and samples the cached blurred background at the new location.
- Electron mouse tests cover all five drawing types, all eight handles, movement, resize, Escape, pointer cancellation and editor-window resize rollback. Glyph tests cover multiline Vietnamese editing after movement/resize and a ZWJ emoji, plus actual Windows clipboard pixel equality with the preview canvas while handles are visible.
- Synthetic 4K pixel tests exercise eight resize directions and movement for text, emoji, blur and rectangle, comparing dirty preview with fresh PNG export. The old mask position restores the original background and the new position receives blur. During development these checks caught a one-pixel antialias remnant; separating geometry from dirty padding and correcting the bounds callback removed it.

- Final validation: `pnpm build` including typecheck, **59 unit tests in 13 files**, **10 desktop E2E tests**, and **9 E2E tests against the packaged executable** all passed. Final 4K render/readback p95 with a moving/scaling blur annotation: **3.70 ms**. This is a synthetic fixture, not physical 4K end-to-end latency.
- Packaged 30-cycle working set at cycles 1/10/20/30: **421740 / 455372 / 462132 / 461572 KB**. One Settings window remained after every close.
- Installer: [Screenshot-Setup-0.3.0-windows-x64.exe](../release/windows-x64-0.3.0/Screenshot-Setup-0.3.0-windows-x64.exe), **114780372 bytes**. SHA-256: `3DC8311F18A17A34E666F1E10922D23B5B5F768D29951CEBBE75D1307ADF35F2`. Built with `pnpm exec electron-builder --win nsis --x64 --publish never --config.directories.output=release/windows-x64-0.3.0`; no public upload or release occurred.

Manual acceptance remains: Windows 11; physical mixed/high DPI and 4K; native IME; real pointer capture interruptions across external applications; clipped glyphs at every image edge; native tray/Save/Paint and interactive installer wizard. Existing hardware limits from the prior QA sections still apply. No rotation, multiple selection, undo/redo, cross-display region or public release was added.

## Implementation map

| Planned tasks | Implementation |
| --- | --- |
| 01–02 | pnpm/runtime/TypeScript/Vite, sandboxed preload contracts, React/shadcn/Tailwind/Zustand |
| 03–04 | Display capture, full-resolution validation, isolated-frame fallback, frozen region overlay and crop |
| 05–06 | Persistent shortcut transactions, tray, single instance, capture lock, cleanup and display-change cancellation |
| 07–11 | Native-pixel editor, arrows, shapes, freehand, hit testing, selected-object color/delete |
| 12 | Blur mask, cached original, dirty-region rendering, pixel and 4K performance checks |
| 13–14 | Shared flatten/export, Electron 44 asynchronous clipboard API, native dialog and PNG persistence |
| 15 | NSIS configuration/artifacts, desktop E2E and QA documentation; manual matrix above remains |

Technical references: [Electron clipboard API](https://www.electronjs.org/docs/latest/api/clipboard), [desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer), [Electron stable releases](https://releases.electronjs.org/?channel=stable).


## GitHub Release workflow — 2026-09-09

Status: **needs review**. Source: .agents/plans/github-release/task.md.

Typecheck, production build and actionlint 1.7.12 passed; 48 unit tests (25 release tests), 7 desktop E2E tests passed. NSIS packaging with --publish never passed. Installer Screenshot-Setup-0.1.0-windows-x64.exe: 114778893 bytes; SHA256 630b1763b82bb1b579bde6d1408c0b39f8fa4f89d2642a94a2dde7ae1a04ce67.

Live GitHub Actions run, hosted Node 22 dependency installation, real release/download, anonymous access, and manual installer wizard install/uninstall remain unverified. No commit, tag push or publication was performed. Remote now exists: hunghg255/windows-screenshot. Local build includes concurrent working-tree changes.

Local host: Windows 10 x64, Node 24.21.0, pnpm 8.15.9. CI is configured for windows-2022 and Node 22.22.0. E2E used the local production build, not a release download. Publisher unit tests mock GitHub responses.

## Installer size optimization — 2026-09-09

Frontend packages moved to `devDependencies`, with versions unchanged, because Vite bundles them. Packaging now includes only `en-US` and `vi` Electron locales and the two native runtime assets (`icon.ico`, `capture-frame.html`). The renderer still includes its logo. The packaged ASAR has no `node_modules` directory.

Compared with the existing `release/windows-x64-0.3.0` artifact (not a fresh baseline build):

| Artifact | Existing bytes | Optimized bytes |
| --- | ---: | ---: |
| NSIS installer | 114780372 | 103520711 |
| Entire win-unpacked directory | 424149845 | 337091999 |
| resources/app.asar | 38728766 | 897624 |

Installer size fell 9.81%; the unpacked application is 87057846 bytes smaller. Artifact: [optimized installer](../release/windows-x64-optimized/Screenshot-Setup-0.3.0-windows-x64.exe). SHA-256: `905D95C186846CC64005AEC87B3E26686D4D36FE254125B67F6D70D3AF39BC39`.

Validation: `pnpm build` (including typecheck), 59 unit tests, and all 9 packaged desktop E2E tests passed. E2E covered native hotkeys on two monitors, 30 capture cycles, full/region capture, fallback capture, drawing/glyph transforms, clipboard and PNG save integration. Desktop E2E required execution outside the sandbox and a separate output directory (`test-results/optimized-build`) after Windows denied cleanup of earlier test output. The native Save chooser and installer wizard were not manually tested. Dependency installation used the available Node 22.22.0 runtime after pnpm's node_modules recreation stalled under Node 24.

Build command: `pnpm exec electron-builder --win nsis --x64 --publish never --config.directories.output=release/windows-x64-optimized`. No release was published.
