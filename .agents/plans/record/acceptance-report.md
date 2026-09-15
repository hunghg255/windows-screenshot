# Screen recording — implementation audit

Date: 2026-09-15. **Status: needs review.**
Source: [approved implementation plan](task.md), [task checklist](todo.md), and the user's “implement đi” instruction.

## Implemented

- Recording setup reachable from the existing Screenshot window and tray; primary screen first, live source refresh, thumbnails, full-screen/region modes.
- Dedicated region overlay with move/resize handles, confirmation/cancel, physical-pixel size label, and selected-area thumbnail highlight.
- Hidden recorder with background throttling disabled; getDisplayMedia source authorization; VideoFrame/processor/generator crop based on actual visible frame bounds; output capped at 1080p while preserving aspect ratio.
- Optional microphone, device picker/preview meter, mute through GainNode, and video continuation when the microphone track ends.
- Main-owned state, countdown, pause/resume, elapsed time, stop/end barrier, command watchdogs, tray indicator and configurable native global shortcuts.
- Sandboxed typed preload methods, sender/main-frame/role validation, screen grant bound to the active recorder; generic camera permission remains denied.
- One in-flight chunk upload, 8 MiB payload limit, 32 MiB queue budgets, sequential WriteStream writes with write/drain acknowledgement and flush-on-close.
- Streaming WebM finalization with duration, SeekHead and keyframe Cues; cue index is written to a sidecar instead of retained in a growing array. Existing output files are not overwritten.
- Disk preflight/polling, reserve for finalization, source/power interruption handling, exclusive partial files and user-data journals, recovery into a new output file.
- Separate recording settings preserve the existing screenshot settings format. Result IDs restrict file/folder opening to known recordings.
- API probe, frame/container inspector, benchmark harness and user documentation.

The optional floating control bar is deferred. Tray/hotkeys provide control while the setup window is hidden.

All modes use the processor/generator path with one second of discarded startup frames to warm the Windows capture source before recording. Short verification reduced the initial maximum encoded gap from 652–791 ms to 92 ms in development and 88 ms in the final package. This does not establish sustained frame-rate acceptance. Initial setup settings now finish loading before controls enable; stale mic previews are cancelled, and cancelling during backend startup cannot transition into recording.

## Actual file map

| Area | Files |
|---|---|
| IPC/types/coordinates | shared/recording-contracts.ts, shared/recording-geometry.ts, electron/preload.cts, src/env.d.ts |
| Main recording | electron/recording/controller.ts, session.ts, file-writer.ts, finalize.ts, disk.ts |
| UI and pipeline | src/recording/Setup.tsx, RegionOverlay.tsx, recorder.ts, src/stores/recording.ts |
| Existing app integration | electron/main.ts, src/main.tsx, src/settings/ShortcutSettings.tsx, src/styles.css |
| Automated checks | tests/recording-{session,geometry,writer,finalize,disk}.test.ts, tests/e2e/recording.spec.ts |
| Reproduction | scripts/recording-probe.mjs, recording-benchmark.mjs, inspect-webm.mjs, documentation/recording.md |

Source selection, permissions, lifecycle and journals were consolidated into controller.ts; audio is owned by recorder.ts with preview in Setup.tsx. Planned separate test files were consolidated into the five unit files and one recording E2E file listed above.

## Verification performed

- Production build and TypeScript checks passed.
- **145 unit tests across 25 files passed** on the final code.
- **10 integration tests passed** covering the recording feature and screenshot/shortcut/editor regressions.
- After the final recording changes, **all 3 recording E2E tests passed again**:
  - Full-screen recording, pause/resume, stop, finite duration, Chromium playback and Chrome seeking at 10/50/90%.
  - Actual Windows hotkeys while another process has focus; ten consecutive recording sessions returning to two UI windows.
  - Region selection, microphone/mute with a synthetic input device, countdown cancellation, camera denial, unauthorized chunk rejection, recorder crash and recovery.
- New writer tests exercise a chunk larger than the stream high-water mark, order/duplicate/gap rejection, exclusive creation and final-sequence checks.
- WebM tests cover duration/seek metadata, truncated-cluster recovery, invalid headers and overwrite refusal.
- Visually inspected setup UI using a synthetic thumbnail; screenshot at test-results/recording-setup-ui.png.
- Unsigned Windows x64 NSIS packaging completed. Version remains 0.3.9; no commit, version bump or publication was requested.

## Runtime measurements and interpretation

Machine: Windows 10 build 19045, Intel i5-1145G7, 4 physical / 8 logical CPUs, 32 GiB RAM, Electron 44.3.0. Two physical displays at 100% DPI: 1920×1080 and 1920×1200.

| Run | Observed result | Scope |
|---|---|---|
| Full screen, 10 minutes | 601.49 s WebM, 129,669,316 bytes, no crash | Stability smoke; initial fixture did not reliably cover the selected secondary display |
| Region + synthetic mic, 10 minutes | 601.00 s WebM, 100,436,078 bytes, no crash; private working-set samples approximately 416–437 MB early in the run | The fixture used default background throttling; encoded-frame rate was only about 12.5 fps, so this run cannot establish the frame-rate target |
| Corrected unthrottled fixture, region + synthetic mic, 2 minutes | 121.58 s WebM, 36,583,749 bytes, 3,500 encoded video frames; CPU sample average 7.69%, maximum 8.82%; private working-set samples 440.72 and 422.84 MB | About 28.8 encoded fps overall. Input frame gap after startup measured up to 99.4 ms; output maximum gap 545 ms preceded the capture warmup fix. Further long-run acceptance remains open |
| Final packaged executable | 18.75 s WebM, 4,264,539 bytes, 540 video frames, maximum frame gap 88 ms; launch to recording 3,886 ms; region + synthetic mic | Short packaged smoke only |

The harness now waits for the fixture to animate before recording, places it on the selected display and disables its background throttling. It records fixture frame count, input-frame statistics for the crop path and encoded frame count from the resulting WebM. These measurements help distinguish source pacing, startup/static-scene gaps and encoder drops.

Memory accounting matters: summed working set includes shared pages and was approximately 1 GB; summed private committed bytes were around 600 MB. The private-resident-memory metric used here is Windows WorkingSetPrivate. Raw metric files preserve all three values. No two-hour plateau or <500 MB guarantee is claimed from these short samples.

The development benchmark uses Playwright instrumentation and some runs overlapped packaging/unit checks. Use the standalone packaged command with an otherwise controlled workload for acceptance.

## Outstanding acceptance checks

- Two separate >=2-hour runs (full/mic and region/mic); the planned one-hour intermediate gate was not run.
- A real recording larger than 5 GB, including finalize/recovery memory peaks and seeking near the end.
- Sustained 1080p30 with measured frame loss and no visible stutter, <=1% loss if that proposed threshold is retained.
- Long-term private-working-set slope and the strict 500 MB ceiling, including finalization/recovery.
- Firefox and VLC playback: neither was installed in the inspected environment.
- Pixel-level crop comparison on physical 125%, 150%, 200% / mixed-DPI displays; macOS/Retina is outside the Windows-first implementation.
- Physical mic removal/busy/denied cases, A/V synchronization at start/middle/end of a long recording.
- Hardware display unplug, forced suspend/shutdown, disk-full injection and native installer/save-folder wizard checks.
- The optional floating control bar and its content-protection validation.

## Reproduction

See [recording guide](../../../documentation/recording.md). Key commands:

```powershell
pnpm.cmd build
pnpm.cmd test
pnpm.cmd exec playwright test tests/e2e/recording.spec.ts --output=test-results/recording-review
node scripts/recording-benchmark.mjs --minutes 120
node scripts/recording-benchmark.mjs --minutes 120 --region --fake-mic
node scripts/recording-benchmark.mjs --minutes 120 --region --fake-mic --executable release/windows-x64-recording-final/win-unpacked/Screenshot.exe
```

Installer: [Screenshot-Setup-0.3.9-windows-x64.exe](../../../release/windows-x64-recording-final/Screenshot-Setup-0.3.9-windows-x64.exe).
