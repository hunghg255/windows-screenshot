# Screenshot for Windows

A local Electron screenshot tool with global shortcuts, frozen region selection, and a pixel-resolution annotation editor. Images stay in memory until you explicitly copy or save them.

## Download and install

Open [GitHub Releases](https://github.com/hunghg255/windows-screenshot/releases), choose a release, expand **Assets**, and download `Screenshot-Setup-<version>-windows-x64.exe`. Run the installer, choose an installation folder, and launch Screenshot from its shortcut. Node.js is not required. GitHub's **Source code** ZIP/tar.gz files are not installers.

The installer is for Windows x64 and is currently unsigned, so Windows may show an unknown-publisher warning. Optional integrity check: compare `Get-FileHash .\Screenshot-Setup-<version>-windows-x64.exe -Algorithm SHA256` with the accompanying `SHA256SUMS.txt`. Updates are installed manually from Releases; in-app auto-update is not included.

## Publish a release

The **Windows release** workflow runs when a tag starting with `v` is pushed. It validates the tag against `package.json.version`, runs typechecking and unit tests, builds a Windows x64 NSIS installer, and publishes the installer plus its SHA-256 checksum to GitHub Releases. Stable tags produce normal releases; tags such as `v0.2.0-beta.1` produce prereleases that are not marked Latest.

1. Ensure the workflow and release scripts are committed. Update `package.json.version` to the version being released, for example `0.2.0`. Keep the lockfile consistent if dependencies change.
2. Run `pnpm typecheck`, `pnpm test`, and `pnpm build`; commit the release changes and push the commit.
3. Create and push the matching tag (replace this example version with your package version):

```powershell
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

Use `vMAJOR.MINOR.PATCH` or a SemVer prerelease, without build metadata. Tag/version mismatches fail before dependency installation. Branch pushes do not publish. Do not move an already published version tag; release a new version instead.

Check **Actions → Windows release** for progress and failures. Build failures do not publish a release. An upload failure leaves a draft; use **Re-run failed jobs** to continue it. A complete published release is left unchanged on rerun; a published release missing assets fails for maintainer review rather than replacing public binaries.

Enable GitHub Actions and allow the publish job's `contents: write` permission under repository/organization policy. The workflow uses the built-in `GITHUB_TOKEN`; no personal access token is required. The repository must be public for everyone to download without repository access. Code signing is a separate future setup.

## Development

Use Node **22.12+** (tested with Node 24.21.0) and **pnpm 8.15.9** on Windows x64.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

If PowerShell execution policy blocks `pnpm.ps1`, use `pnpm.cmd` for every command. The postinstall script downloads the pinned Electron runtime with checksum verification and uses Windows ZIP extraction. It does not require installing a system service or changing PowerShell policy.

```powershell
pnpm typecheck
pnpm test -- tests/geometry.test.ts
pnpm test
pnpm build
pnpm test:e2e
pnpm dist
```

`pnpm dev` starts Vite and Electron, and shuts Vite down when Electron quits from the tray. Renderer changes update live; restart dev after editing main/preload. `pnpm dist` creates an unsigned Windows x64 NSIS installer in `release/windows-x64/`. For local packaging that must never publish, run `pnpm build` followed by `pnpm exec electron-builder --win nsis --x64 --publish never`.

Packaging keeps only the English and Vietnamese Electron locales. Frontend libraries live in `devDependencies` because Vite bundles them into `dist`; Electron main/preload currently need only Node, Electron, and local modules. Put any future external main-process runtime dependency in `dependencies` so it is included in the installer. Build icons use `assets/logo.png`; the renderer bundles its own copy, while the native runtime assets are limited to `icon.ico` and `capture-frame.html`.

## Usage

- **Ctrl+Alt+F:** capture the whole display containing the cursor, including the taskbar.
- **Ctrl+Alt+R:** drag a region on that display. Release to open the editor; Escape cancels.
- In Settings, choose **Capture display** before using Full screen or Select region. The tray also has a capture submenu for each connected display. Buttons use that explicit display; hotkeys use the cursor location at activation. A disconnected selection requires choosing another display.
- Change shortcuts in Settings by focusing either field and pressing a combination, then Apply. Unavailable shortcuts are rejected and previous registrations restored.
- Draw arrows, rectangles, circles, freehand strokes or blur. Hold Shift for a square. Color and size affect the next stroke; color also updates a selected colored object.
- Choose Select, click an outline/stroke and press Delete or use the trash button. Blur is selectable and removable.
- **Text:** click the image, enter text and choose Done or Ctrl+Enter. Enter adds a line; Escape discards the draft. Double-click existing text in Select to edit it. Text supports 2,000 Unicode code points, 20 lines, and sizes 12–160 image pixels; select it to change color/size or delete it.
- **Emoji:** pick an offline emoji, then click the image to place it. Select it to resize (16–256 image pixels) or delete. The palette uses the available colored Segoe UI Emoji glyphs; emoji colors are preserved. Arrow keys navigate the picker; Escape dismisses the picker or pending placement first.
- **Move and resize:** choose Select and drag an object or the inside of its selection frame to move it. Drag any of the **four corners or four edge handles** to resize. This works for arrows, shapes, freehand, blur, Text and Emoji. Shapes/strokes stretch freely; Shift on a corner keeps their ratio. Text/Emoji always keep their ratio and existing size limits. Blur moves its mask onto the new background.
- Release the mouse to apply a move/resize. Escape, interrupted pointer capture or resizing the editor window discards the current drag. Copy/Save and tool changes are disabled during dragging. Selection handles keep their on-screen size at any zoom and are excluded from exported images.
- Escape first discards an in-progress stroke, otherwise closes the capture. Copy/Save keep the editor open.
- Closing Settings leaves the app in the system tray. Right-click the tray icon to capture, open Settings, or Quit.

Annotations remain in original image pixels regardless of zoom. Blur uses a cached blurred original and a union of stroke masks; colored annotations are always above blur. Preview and PNG export share one renderer, while selection decoration is preview-only.

## Structure and privacy

`electron/` owns capture, shortcuts, native dialogs, clipboard and persistence. `shared/` defines IPC types and coordinate validation. `src/stores/editor.ts` owns editor state through Zustand; components import `useEditor` and select the state/actions they need. `src/editor/` contains geometry, hit testing and Canvas rendering. React Context is not used for application state.

Only shortcut settings and the last successful save directory are stored in the Electron userData folder. Capture images are not logged, uploaded, or written to temporary files. Dev/test tooling may explicitly produce screenshots as QA artifacts. The IPC bridge has no generic filesystem, command execution, or arbitrary event-channel API.

See [Windows QA](docs/windows-qa.md) for validation evidence and outstanding hardware checks. E2E tests require an unlocked interactive Windows desktop and write a test image to the clipboard. The Save integration test substitutes only the native file chooser; native dialog interaction still needs manual QA.
