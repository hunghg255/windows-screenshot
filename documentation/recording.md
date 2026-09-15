# Screen recording

Open **Record screen** in the Screenshot window or tray menu.

1. Choose a screen. The primary screen is listed first; the last available choice is restored.
2. Choose **Full screen** or **Region**. Drag a region, adjust its edges or move it, then press Enter or **Use region**. Escape cancels.
3. Optionally enable a microphone. **Test microphone** previews its level; it does not save audio. Allow microphone access in Windows privacy settings if needed.
4. Choose an output folder. **Start recording** starts writing video locally. The optional countdown lasts three seconds.
5. Use the tray, or reopen the recording window, to pause, resume, mute or stop.

Default shortcuts:

| Action | Shortcut |
|---|---|
| Stop | Ctrl+Shift+2 |
| Pause / resume | Ctrl+Shift+3 |

The shortcut fields accept Electron-style combinations, for example `Ctrl+Alt+Shift+F21`. Changes are applied when starting the next recording. Conflicts are reported and the previous registration is restored.

## Files and recovery

The app saves WebM (VP8 first, VP9 if needed; Opus for microphone audio), up to 1920×1080 at 30 fps while preserving aspect ratio. It captures one screen at a time. System audio and webcam overlays are not included.

Video chunks are written sequentially to a `.webm.part` file. Stopping waits for the final chunk, then writes duration and seek metadata before reporting success. Finalization streams the file, so memory does not depend on the whole recording size.

Allow space for the recording and another complete copy during finalization. Filesystems that do not support hard links can need a second temporary copy when publishing the result. The app warns below 5 GB and stops when a periodic check detects less than 500 MB; a large recording may still need more free space before it can be finalized.

If a recorder crash or disk error leaves a partial file, reopen **Record screen** and use **Recover**. Recovery creates a new file from complete media data and keeps the original partial file. It cannot restore frames that never reached the disk.

Closing the recording setup window keeps the recording active. Quit requests stop and finalize an active recording. Display changes, screen locking and suspend trigger a stop where the operating system allows it. A forced shutdown may require recovery.

## Validation

Build and tests:

```powershell
pnpm.cmd build
pnpm.cmd test
pnpm.cmd exec playwright test tests/e2e/recording.spec.ts --output=test-results/recording
```

The recording E2E test uses a real Windows desktop and Chrome; one test uses synthetic microphone input. It tests pause/resume, mute, native global shortcuts, countdown cancellation, ten consecutive recording sessions, Chromium/Chrome playback and crash recovery. Close other test instances before running because global shortcuts are shared by Windows.

Benchmark (records to a new folder under the system temporary directory):

```powershell
node scripts/recording-benchmark.mjs --minutes 120
node scripts/recording-benchmark.mjs --minutes 120 --region --fake-mic
```

Use `--mic` instead of `--fake-mic` only when you intend to record your actual microphone. Keep the desktop unlocked. A separate fixture window supplies animated content on the chosen screen. The fixture process is excluded from app metrics. The benchmark creates `machine.json` and `metrics.jsonl` with numeric measurements and the resulting local video.

For a packaged build, set `SCREENSHOT_EXECUTABLE` to the generated `Screenshot.exe` before running the benchmark. The short E2E suite currently launches the development build.

Memory figures mean different things: total working set includes shared pages, private bytes measure committed private memory, and Windows `WorkingSetPrivate` is private resident memory. The benchmark records all three. CPU is derived from cumulative CPU seconds, normalized by logical processor count. See [Electron CPUUsage](https://www.electronjs.org/docs/latest/api/structures/cpu-usage) and [MemoryInfo](https://www.electronjs.org/docs/latest/api/structures/memory-info).

Two-hour stability, a real file larger than 5 GB, Firefox/VLC playback, mixed-DPI pixel accuracy and physical microphone disconnect still require the full acceptance matrix. Passing short tests is not a substitute for these checks.
