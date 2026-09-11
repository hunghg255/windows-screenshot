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

## Rotation and even rectangle strokes — 2026-09-10

Status: code complete; needs review for the manual/hardware items below. Source: Windows screenshot plan Task 28–33 and the user's implementation request. Local package version remains 0.3.3; this is an unpublished working-tree build.

Implemented:

- Arrow, rectangle/square, Text and Emoji can rotate freely through 360° in either direction around their center. The round handle displays the angle; Shift snaps to 15°. Eight resize handles follow the rotated axes and preserve the opposite world-space anchor. Text/Emoji keep uniform sizing and their size limits.
- Rectangle scale applies to geometry only, preserving equal stroke width on all sides. Selecting a rectangle shows its actual width; the Size slider edits its outline. Bounds and hit testing follow the fixed-width outline; Shift keeps rectangle geometry aspect and flat rectangles can grow.
- World/local geometry is shared by rendering, selection, inverse hit testing, clipping and dirty regions. Pointer-up commits; existing interruption/cancellation handling restores the snapshot. Text composer/size changes preserve the angle and world placement point. Blur and other drawing tools retain their existing stroke scaling.
- The editor reserves room for the rotation handle. Vite render tests use isolated temporary caches because Windows locked the shared dependency cache during an early run.

Validation:

| Check | Result |
|---|---|
| TypeScript + production build | Passed (`pnpm.cmd build`, includes typecheck) |
| Full Vitest suite | 89 tests in 14 files passed |
| Final Electron desktop suite | 14/14 passed, `test-results/rotation-final` |
| Packaged executable suite | 11/11 passed, `test-results/rotation-packaged`; no Vite |
| Independent stroke regression | Before fix: requested 8 px became 16 px on a scaled edge. After fix: all four sides remain 8 px within 1 px antialias tolerance under nonuniform/uniform enlargement and shrinking |
| Rotated reference paths | 0/45/90/180/270/360° agree with an independently constructed, constant-width world-space rectangle path |
| Incremental/fresh render | Equal after rotate/resize/move/clip/cancel/delete for all four supported types, including multiline Vietnamese and Emoji ZWJ |
| Mouse and clipboard | Full clockwise/counterclockwise turns, 15° snapping, all eight anchors at 45°, move, Escape/pointercancel rollback, text edit/cancel/slider, and pixel-exact Windows clipboard with selection visible passed |
| 4K render/readback | Final p95 3.30 ms, below the existing 33 ms gate; synthetic Canvas benchmark, not physical 4K desktop latency |
| Native desktop regression | Two displays at 100% (1920×1080 and 1920×1200 at negative origin), hotkey while another process has focus, region/fallback, settings persistence, Save integration and 30 capture/cancel cycles passed |
| Packaged lifecycle | Working set at cycles 1/10/20/30: 405472/435772/510616/482796 KB; one Settings window after each cancellation |
| Visual review | [Synthetic rotation preview](images/rotation-preview.png) inspected; no captured desktop in this image |

One initial full desktop run passed 13/14: the Freehand iteration in the existing move/resize test reported zero displacement. Its isolated rerun passed, the packaged suite passed it, and the final complete 14-test rerun passed without retries. The initial trace does not establish a root cause; retain that observation if desktop-pointer flakiness recurs. Earlier failures from the shared Vite cache and duplicate status semantics were resolved before the final runs.

Artifacts:

- Installer: `release/windows-x64-rotation/Screenshot-Setup-0.3.3-windows-x64.exe` (103522202 bytes).
- Executable: `release/windows-x64-rotation/win-unpacked/Screenshot.exe`.
- SHA-256: `FC678C5D4E0EC4B6CF5810F58A8C097CA6302EA1FD26D3DCB183B3E84618C104`.
- Built with `pnpm.cmd exec electron-builder --win nsis --x64 --publish never --config.directories.output=release/windows-x64-rotation`. No commit, tag, version bump or publication.

Remaining manual acceptance: Windows 11; physical DPI 125/150/200%, mixed DPI and 4K; native OS IME entry; native Save dialog (folder/overwrite/cancel/errors), Paint paste; real external pointer interruptions and exhaustive edge/zoom cases; interactive installer install/uninstall. Save integration substitutes the native chooser. Programmatic Unicode/cancellation checks and synthetic fixtures do not establish those manual results. Historical manual items stay open.

## Fixed arrow stroke and head resize — 2026-09-10

Follow-up to Task 40–42: arrows now transform shaft endpoints before stroking, and regenerate symmetric arrowheads from the destination direction and selected image-pixel Size. The existing short-shaft limit (head length at most 60% of shaft length) remains. Bounds/hit tests use that same head geometry; resize scales shaft geometry and preserves the opposite rotated ink anchor. Horizontal/vertical shafts stay finite. Selected Size updates width/head geometry while preserving the rotated shaft position. Blur mask scaling is unchanged.

- Build/typecheck and all 123 unit tests passed. Eleven new arrow tests cover eight anchors at 0/45/90 degrees, horizontal/vertical/reversed directions, head symmetry and length, fixed hit tolerance on shaft/head, short arrows, Shift shrink, rotated clamp and stable shaft position when changing Size.
- Expanded stroke E2E passed: arrow destination paths at four scale pairs and 0/45/90 degrees, long/short/horizontal/vertical/diagonal shafts, independent exact-pixel reference heads, 8 px shaft measurements, repeated resize/move/width/restore/delete, incremental/fresh/export equality and real UI Size/Copy/Save pixel equality. Circle/freehand remain covered in the same test.
- Initial related E2E run: 6/7 passed; the existing all-drawing move test observed a zero move instead of 35 px. Both transform tests passed on the isolated rerun without code changes. All seven distinct tests passed across those runs; the cause of the initial desktop interaction failure is not established. Rotation UI, glyph editing and rectangle pixel regressions passed.
- Visually reviewed synthetic Arrow.png at `test-results/arrow-stroke-validation/stroke-resize-arrow-circle-aa136-draw-and-matching-Copy-Save/Arrow.png`: constant shaft width, symmetric head, aligned frame and Size 12. The new stroke test retains no desktop trace.

Task 43 code and automated/visual validation complete; needs review for the existing native Save/Paint, physical DPI/mixed DPI/4K and broader manual edge/zoom checks. No installer, version bump, commit or publication.

## Fixed circle/freehand stroke resize — 2026-09-10

Task 40–41 implemented; Task 42 automated and visual checks passed, needs manual/hardware review. Circle/ellipse and freehand now transform geometry before stroking at the selected image-pixel width. Bounds, resize anchors, hit testing and selected Size updates use the same policy. Freehand dots and repeated points stay round; zero-length axes do not create phantom geometry or prevent Shift-shrinking the nonzero axis. Arrow and blur stroke policy is unchanged.

Validation:

- `pnpm.cmd build` (including typecheck) and all 112 unit tests passed. Coverage includes eight fixed anchors, clamp/minimum, Shift, repeated resize, immutable points, degenerate strokes, selected-width changes and ellipse distance against an independently sampled boundary (including flat ellipses).
- New `stroke-resize.spec.ts` passed: four nonuniform/uniform scale pairs, independently authored destination ellipse/polyline/dot paths with exact pixel comparisons, 8 px ellipse stroke measurements within 1 px, repeated grow/shrink, move, width changes, restore/delete and incremental/fresh/export equality. A 10,000-point freehand render loop also completed. Real UI draw/select/east resize/Size/Copy/Save passed for circle and freehand; clipboard and saved PNG pixels equal the preview. Native Save chooser was substituted.
- All six related regression E2E tests passed: image import, Canvas blur/layers/export, rectangle stroke pixel measurements, rotation rendering, eight-handle drawing transforms/cancellation/window resize, and glyph move/resize/clipboard. Existing synthetic 4K Canvas render/readback p95: 8.80 ms (33 ms gate). This is not physical 4K capture latency.
- The first pixel runs exposed two incremental/fresh differences on wider freehand diagonal strokes and round joins (maximum channel difference 38). Adding conservative redraw padding around freehand joins resolved both; final pixel equality passed. The initial runners stalled while targeting the shared output folder; separate output folders allowed the runs to complete.
- Visually reviewed synthetic `Circle.png` and `Freehand.png` in `test-results/stroke-resize-validation-3/stroke-resize-circle-and-f-90289-draw-and-matching-Copy-Save/`: even ellipse outline, constant freehand stroke, aligned handles and Size = 12. The UI was fit to a 1920×1080 image. New test disables retained traces to avoid recording the temporary desktop capture before the synthetic replacement.

Remaining: manual native Save/overwrite/Paint paste, physical DPI 125/150/200% and mixed DPI, physical 4K, broader manual zoom/edge interactions. No installer, version bump, commit or publication for this change. Existing manual gaps stay open.

## Image insertion — 2026-09-10

Implemented Insert image for PNG/JPG/JPEG/SVG/WebP, selection, move, eight-handle resize, 360-degree rotation, W/H and aspect lock, delete, Copy/Save. Imports use a session-validated native chooser bridge; Settings cannot invoke the operation. File byte/header checks precede decoding; SVG is parsed and restricted in the sandbox before image loading.

Validation evidence:

- Typecheck/build and 95 unit tests passed. New cases cover raster headers/limits, JPEG extension aliases, image geometry, rotated resize anchors, hit testing and numeric sizing.
- Full desktop regression: 14/15 initially passed. The failure was the existing exact preload-key assertion needing the newly added importImage API. After updating that assertion and adding rejection from Settings, all four screenshot tests passed in the focused rerun. The other ten pre-existing tests passed in the full run, including native hotkeys, two displays at 100%, text/emoji, transformations, region/fallback and 30 capture cycles.
- The image insertion Electron test passed after fixing EXIF decoding. It covers all five extensions through main/preload/file read, W/H, rotated resize, cancel, delete, clipboard pixel equality, Save integration, rejected SVG contents, asset release and stale decode. Generated two-frame WebP/APNG fixtures verify stable first-frame import; an EXIF orientation-6 JPEG verifies swapped dimensions. Native open/save choosers are substituted in this automated test.
- A preview/Copy pixel mismatch was resolved by using one authoritative composition canvas for preview and export. SVG raster caches follow target size and are shared by both paths. Existing synthetic 4K render/readback p95 measured 9.10 ms, below the 33 ms gate; this is not a physical 4K capture-latency measurement.
- Visual QA uses a synthetic canvas background only. The first review exposed width containment collapsing the W/H group; an explicit non-shrinking width fixes overlap. The final image test also checks that dimensions and drawing controls do not overlap.

Remaining manual acceptance: native Open/Save dialog interaction (including Escape/focus), physical DPI 125/150/200% and 4K, complex real-world SVG compatibility, repeated large-image memory stress and manual installer verification. SVG filter/stylesheet/embedded-resource support is intentionally outside the supported subset. No installer, version bump, commit or publication was produced for this change.
## Whole screenshot rotation — 2026-09-10

Task 44–45 implemented; Task 46 needs manual/hardware review. One toolbar button rotates the entire screenshot and editable annotations clockwise in 90° steps. Preview dimensions/fit, pointer conversion, selection handles, and PNG export share scene orientation. The PNG validator now accepts exactly the original or swapped capture dimensions; the preload contract remains unchanged.

- Validation: production build/typecheck passed; 126 unit tests across 18 files passed. The new `screenshot-rotation.spec.ts` passed both tests; five existing tests from `transform.spec.ts`, `rotation-render.spec.ts`, and `image-import.spec.ts` passed.
- A synthetic 640×400 four-color image with rectangle, arrow, ellipse, freehand, blur, text, emoji and inserted-image layers matched an independent integer pixel permutation at all four orientations. Decoded exports matched preview pixels. The UI test checks pointer placement, selection/delete, move deltas, resize, object rotation, busy drawing/drag/composer/picker guards, focus and swapped dimensions.
- Exact dirty/full-redraw comparisons use `--disable-gpu` in the synthetic test: normal GPU rasterization produced differing antialiased edge values across redraws. Quarter-turn pixel permutation itself passed with normal GPU settings. No GPU setting was changed in the application. The real output test and five existing regression tests use normal Electron settings.
- Real capture → rotate → Windows clipboard and Save IPC passed with swapped dimensions; saved PNG bytes matched the preview. Only the native Save file chooser was substituted. A new capture reset to its original dimensions.
- Reviewed synthetic UI screenshot: `test-results/screenshot-rotation/screenshot-rotation-whole--37b01-bjects-and-pointer-geometry/screenshot-rotation.png`. Toolbar wraps without overlap in the small test window; the selection frame and angle label follow the rotated scene.
- Remaining: manual native Save/Paint, physical mixed DPI/125–200%/4K and wider zoom/edge coverage. No installer was rebuilt or version changed for this feature.


## Whole desktop capture, Line and header grid (2026-09-11)

Source: `.agents/plans/windows-screenshot/task.md`, Tasks 47?54, and the user instruction to implement all four requests.

- Home and tray no longer offer per-display capture. Both shortcuts and buttons capture all screens in Windows layout. Full opens one composite; region uses one frozen overlay per monitor, one main-process selection owner and a 16 ms native cursor sampler while dragging. Pointer capture on the originating overlay receives release on the other monitor. Sender/session checks apply to the typed selection IPC; the obsolete display-list/subscription bridge was removed.
- DIP selection maps to a common output density equal to the highest connected scale. Adjacent output edges use the same rounding rule. Gaps are transparent and a crop wholly inside a gap is rejected. Native capture errors, display changes, overlay close/crash and session cancellation clear overlays and timers. Overlay startup also settles when a window is closed before ready.
- Allocation guards limit the composite and aggregate native source frames to 32 million pixels, with 16384 pixels per composite edge. Each 32 MP BGRA surface is 128 MB; this is a surface limit, not a promise that total process RAM is 128 MB. Current implementation composites before region selection, rather than postponing composition until crop. This keeps one validated crop pipeline; extremely large desktop configurations report a limit error even for a small desired crop.
- Line is a two-endpoint annotation with fixed-width stroke, no arrowhead, shared bounds/hit testing, move/resize/rotation, selected color/width, delete and export. New geometry/render unit coverage includes horizontal/vertical degeneracy and no phantom arrowhead. Existing rotation E2E now includes Line.
- Toolbar has equal grid columns, scrollable tools/properties left and fixed Copy/Save/Cancel right. Responsive assertions cover 640/800/1120 px. At desktop-fit zoom, small object handle hit areas can overlap: pointer-down now chooses the nearest handle center instead of the last overlapping DOM button. Existing small emoji resize/rotated-anchor tests exposed and verify this correction.
- Physical native-input evidence: two monitors, `(0,0,1920,1080)` and `(-1920,-116,1920,1200)`, both scale 1. Forward and reverse native drags between `(100,100)` and `(-150,934)` produced one 250?834 crop and closed all overlays. Native global shortcuts from another process also passed.
- Synthetic evidence: three screens at scale 1/1.5/2, staggered origins, composite 1680?720. Native bitmap samples confirmed red/green/blue placement and transparent gaps; one selection traversed all three overlays and cropped 1280?240. These mocks verify composition and selection coordination, not the OS mixed-DPI pointer mapping.
- Initial full regression: 19/21 passed; two small-emoji handle tests failed after the larger desktop reduced fit zoom. Nearest-handle correction resolved both; the focused rerun passed 8/8, including native drags in both directions. 130 unit tests and production build/typecheck passed; final full regression result recorded below.
- Thirty capture/cancel cycles returned to one settings window every time. Measured working set: 451180 / 540472 / 580976 / 470532 KB at cycles 1 / 10 / 20 / 30. Synthetic 4K renderer p95 was 8.30 ms in the initial full run.
- Remaining hardware/manual review: three or more physical monitors, physical mixed DPI (125/150/200%), physical 4K and larger-memory configurations, actual cable hotplug, native Save chooser/overwrite and Paint paste. Automated clipboard and stubbed-save tests do not replace those checks. No installer, version bump, commit or publication.

Implementation references: [Electron screen coordinates](https://www.electronjs.org/docs/latest/api/screen), [nativeImage bitmap/resize](https://www.electronjs.org/docs/latest/api/native-image).

Final verification: `pnpm.cmd build` (includes both typechecks) passed, `pnpm.cmd test` passed 130/130, and `pnpm.cmd exec playwright test --output=test-results/desktop-final` passed 23/23 in 2.9 minutes. Includes gap rejection, wrong-owner rejection, selection reset, synthetic display-change cleanup, both native drag directions, Line in rotation tests, 30 capture/cancel sessions, clipboard and save integration. Final 4K p95: 9.70 ms. Final cycle working sets: 454460 / 553492 / 556944 / 682620 KB; windows returned to one each time (RSS is GC-dependent; no hard RSS bound inferred). [640 px header](images/editor-header-640.png) and [Line on synthetic desktop](images/line-desktop-editor.png) were visually inspected.


## Two-row header and clearer output feedback (2026-09-11)

Follow-up replaces the equal-width scrolling header: drawing tools occupy the first left row; properties and rotate/import/delete occupy the second. The right column uses icon-only Copy/Save/Cancel with native title tooltips and accessible labels. No horizontal scrollbar or overflow at 640/800/1120 px. Successful copy/save feedback remains at bottom right, now 14 px, weight 700, success green with a subtle tinted background. Other hints/errors are not colored as success. The footer reserves height to prevent output feedback from changing the canvas fit. A toast dependency was unnecessary.

Validation: production build/typecheck and 130 unit tests passed. Three focused final E2E passed (responsive header and Copy styling, image import/edit/export, real Copy/Save/cancel). The old image-dimension placement assertion was updated to require the new second-row position. Two capture coordination E2E also passed during this follow-up. Synthetic 640 px and success-feedback screenshots were visually inspected and refreshed in docs/images. No installer generated.
