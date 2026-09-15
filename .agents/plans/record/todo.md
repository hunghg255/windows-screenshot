# Task checklist: Screen recording

Nguồn quyết định: [task.md](./task.md). Đặc tả gốc: [plan.md](./plan.md).
**Status: needs review.** Code đã triển khai và đóng gói; xem [acceptance-report.md](acceptance-report.md) để đối chiếu bằng chứng, file thực tế và giới hạn. Các checkbox nghiệm thu chưa xác minh giữ nguyên; đường dẫn dự kiến bên dưới là lịch sử kế hoạch.
Mỗi task là một phiên tập trung; nếu vượt khoảng 5 file hoặc 2 giờ làm chủ động thì chia nhỏ trước khi thực hiện. Thời gian soak là thời gian máy chạy riêng.

## Gate trước implementation

- [x] Người dùng cho phép triển khai bằng “implement đi”; thực hiện Windows trước theo repository. macOS/Retina chưa triển khai; định nghĩa đo RAM cần được review.
- [x] Đọc AGENTS.md và skill React/shadcn/Zustand; giữ thay đổi đang có.

## Quy tắc verification chung

- Mỗi task code chạy pnpm.cmd typecheck và unit tests liên quan; pnpm.cmd build trước E2E.
- Mỗi checkpoint chạy pnpm.cmd typecheck, pnpm.cmd test, pnpm.cmd build và E2E bị ảnh hưởng.
- pnpm.cmd build đã bao gồm typecheck; không cần chạy lặp cùng check nếu build vừa pass và không có thay đổi mới.
- Unit/E2E giả lập xác minh lỗi và protocol; native media/permissions, dialog, DPI và soak cần máy thật. Ghi rõ pass/fail/chưa chạy.
- Dùng fixture không có nội dung riêng tư; desktop E2E cần máy unlock và có thể thay đổi clipboard.

## Task 1: Spike pipeline trên Electron đã pin

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 1

**Description:** Dùng harness cô lập để xác minh rủi ro capture ẩn, processor/generator và WebM trước khi tích hợp sản phẩm.

**Acceptance criteria:**
- [ ] Capture 1080p30 chạy 10 phút khi setup thu nhỏ; báo API processor/generator, user activation, codec, timestamp và đường resize được hỗ trợ.
- [ ] Thử crop với VideoFrame, đóng frame đầy đủ; so sánh full/crop về CPU và RAM; ghi rõ fallback nếu API không hoạt động.
- [ ] Phân tích WebM thực (kể cả pause), chọn cách xử lý Duration/Cues/SeekHead theo stream; thử file hợp lệ >5 GB, không đọc toàn file vào RAM.

**Verification:**
- [ ] Chạy node scripts/recording-probe.mjs; mở output trong Chrome/Firefox/VLC và ghi bằng chứng, không cam kết hiệu năng từ mock.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** None

**Files likely touched:**
- `scripts/recording-probe.mjs`
- `tests/fixtures/recording-probe.html`
- `.agents/plans/record/probe-results.md`

**Estimated scope:** Medium (3–5 files).

## Task 2: Định nghĩa contract recording

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 2

**Description:** Đóng băng schema IPC theo phần 4.4 và những ACK/end barrier cần cho truyền dữ liệu có giới hạn.

**Acceptance criteria:**
- [ ] Typed config/state/result/chunk/command/error và schema runtime từ chối dữ liệu không hợp lệ; có sessionId, requestId, revision, sequence.
- [ ] Bridge hẹp tách quyền setup/overlay/recorder; không expose raw IPC hoặc generic đường dẫn; giữ ScreenshotAPI tương thích.
- [ ] Ma trận kênh/role và quy tắc ACK/endOfStream được ghi đủ; test payload quá lớn, NaN, phiên cũ.

**Verification:**
- [ ] pnpm.cmd test -- tests/recording-contracts.test.ts
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 1

**Files likely touched:**
- `shared/recording-contracts.ts`
- `shared/recording-validation.ts`
- `electron/recording-preload.cts`
- `src/env.d.ts`
- `tests/recording-contracts.test.ts`

**Estimated scope:** Medium (3–5 files).

## Task 3: Xây dựng state machine trong main

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 3

**Description:** Tạo phiên quay độc lập CaptureSession và xử lý lệnh xác định được thứ tự.

**Acceptance criteria:**
- [ ] Có tất cả transition trong task.md, gồm full→ready, Esc/hủy countdown, lỗi từ mọi bước và reset sau cleanup.
- [ ] Start/stop trùng, ACK muộn, request của phiên cũ và pause/resume đua nhau không làm lệch state; active duration loại pause.
- [ ] Snapshot revision và watchdog hỗ trợ renderer mở lại; trạng thái recording chỉ có sau ACK thực.

**Verification:**
- [ ] pnpm.cmd test -- tests/recording-session.test.ts; fake clock kiểm tra timeout và pause.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 2

**Files likely touched:**
- `electron/recording/session.ts`
- `tests/recording-session.test.ts`

**Estimated scope:** Small (1–2 files).

## Checkpoint: Sau Task 1–3

- [ ] Contract và spike: review kết quả API/container, chưa mở rộng UI khi đường capture/finalize chưa khả thi.
- [ ] Typecheck, toàn bộ unit tests, build và E2E liên quan pass.
- [ ] Review bằng chứng, cập nhật rủi ro/ước lượng; xử lý lỗi trước nhóm tiếp theo.

## Task 4: Ghi chunk xuống file có backpressure

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 4

**Description:** Tạo writer main và journal nhỏ có khả năng dùng với adapter IPC ở bước tích hợp.

**Acceptance criteria:**
- [ ] Ghi file .webm.part độc quyền đúng sequence; ACK sau write/drain, kiểm tra role/session ở adapter; close đợi đủ lastSequence.
- [ ] Giới hạn byte queue/in-flight rõ ràng, xử lý slow disk, chunk trùng/thiếu, ENOSPC và lỗi close; không tích lũy Promise vô hạn.
- [ ] Crash/error giữ .part và journal tin cậy; không ghi đè file có sẵn, không trả success nếu dữ liệu chưa đủ.

**Verification:**
- [ ] pnpm.cmd test -- tests/recording-writer.test.ts tests/recording-journal.test.ts; injected slow/failing writable và file tạm.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 2, 3

**Files likely touched:**
- `electron/recording/file-writer.ts`
- `electron/recording/journal.ts`
- `tests/recording-writer.test.ts`
- `tests/recording-journal.test.ts`

**Estimated scope:** Medium (3–5 files).

## Task 5: Khởi tạo Recorder riêng

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 5

**Description:** Tạo route/window bootstrap và handshake an toàn nhưng chưa bật chức năng quay trong UI.

**Acceptance criteria:**
- [ ] Recorder ẩn dùng backgroundThrottling:false, preload recording, sandbox và khóa navigation.
- [ ] Route recorder không chạy screenshot.current() hoặc tải editor ảnh; handshake/cleanup hoạt động dev và packaged.
- [ ] Chỉ mở một recorder cho phiên; lỗi tải/crash được báo về main; không thay đổi luồng screenshot.

**Verification:**
- [ ] pnpm.cmd exec playwright test tests/e2e/recording-window.spec.ts; build trước E2E.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 2, 3

**Files likely touched:**
- `electron/recording/windows.ts`
- `src/recording/Recorder.tsx`
- `src/App.tsx`
- `electron/main.ts`
- `tests/e2e/recording-window.spec.ts`

**Estimated scope:** Medium (3–5 files).

## Task 6: Quay toàn màn hình từ setup đến file

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 6

**Description:** Tích hợp nguồn, Start/Stop tối thiểu và adapter truyền chunk để có lát chức năng chạy thật.

**Acceptance criteria:**
- [ ] Setup liệt kê thumbnail và chọn đúng display_id; chọn thư mục bằng main trước Start; chỉ nguồn/recorder đã cấp phép dùng display media.
- [ ] Start→MediaRecorder→chunk→writer→Stop tạo .part phát được; binary queue có giới hạn và end barrier, chưa hiển thị file là hoàn tất khi chưa finalize.
- [ ] Permission handlers chỉ cấp media đúng role/frame/origin; hủy dialog không tạo file; đăng ký recording không nới quyền screenshot.

**Verification:**
- [ ] pnpm.cmd exec playwright test tests/e2e/recording-basic.spec.ts; kiểm thử màn hình thứ hai, deny permission, fake sender và chunk cuối.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 3, 4, 5

**Files likely touched:**
- `electron/recording/controller.ts`
- `electron/main.ts`
- `src/recording/Recorder.tsx`
- `src/recording/Setup.tsx`
- `tests/e2e/recording-basic.spec.ts`

**Estimated scope:** Medium (3–5 files).

## Checkpoint: Sau Task 4–6

- [ ] Lát full-screen: Start/Stop ghi đúng nguồn, chunk cuối không mất, screenshot vẫn hoạt động.
- [ ] Typecheck, toàn bộ unit tests, build và E2E liên quan pass.
- [ ] Review bằng chứng, cập nhật rủi ro/ước lượng; xử lý lỗi trước nhóm tiếp theo.

## Task 7: Hoàn tất WebM tua được

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 7

**Description:** Áp dụng chiến lược container đã chứng minh từ spike vào writer và kết quả phiên.

**Acceptance criteria:**
- [ ] Duration đúng theo media timeline, Cues/SeekHead và offsets hợp lệ; seek 10/50/90% trong cả ba player, gồm file >5 GB.
- [ ] Finalize dùng bộ nhớ giới hạn, không chặn main; nếu remux cần file tạm thì kiểm tra đủ chỗ trước, giữ .part khi lỗi.
- [ ] Chỉ đổi tên và phát finished sau khi file đóng, metadata được xác minh; retry không phá file gốc.

**Verification:**
- [ ] pnpm.cmd test -- tests/recording-finalize.test.ts; pnpm.cmd exec playwright test tests/e2e/recording-finalize.spec.ts; manual >5 GB với 3 player.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 6

**Files likely touched:**
- `electron/recording/webm.ts`
- `electron/recording/finalize.ts`
- `electron/recording/controller.ts`
- `tests/recording-finalize.test.ts`
- `tests/e2e/recording-finalize.spec.ts`

**Estimated scope:** Medium (3–5 files).

## Task 8: Đếm ngược và pause/resume

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 8

**Description:** Hoàn chỉnh điều khiển thời gian từ setup tới recorder theo state main.

**Acceptance criteria:**
- [ ] Countdown 3 giây hoặc tắt; cancel giải phóng tài nguyên, không để file rỗng mồ côi; capture bắt đầu sau countdown.
- [ ] Pause/resume có ACK, timer và timeline output loại pause; rapid pause/stop không mất chunk cuối.
- [ ] Setup ẩn/mở lại nhận snapshot mới và đúng nút; trạng thái lỗi/finalizing có thông báo rõ.

**Verification:**
- [ ] pnpm.cmd exec playwright test tests/e2e/recording-controls.spec.ts; pause 30 giây nhiều lần rồi đối chiếu duration.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 7

**Files likely touched:**
- `electron/recording/controller.ts`
- `src/recording/Recorder.tsx`
- `src/recording/Setup.tsx`
- `src/stores/recording.ts`
- `tests/e2e/recording-controls.spec.ts`

**Estimated scope:** Medium (3–5 files).

## Task 9: Đo quay dài một giờ

**Status:** needs review — long-run acceptance not executed

- [ ] Hoàn thành Task 9

**Description:** Tạo harness số liệu và chạy gate hiệu năng sớm trên bản full-screen đã hoạt động.

**Acceptance criteria:**
- [ ] Đo mỗi 5 giây tổng process memory/CPU, throughput, queue peaks và media timing; log không chứa nội dung capture.
- [ ] Quay thật 1 giờ 1080p30 với cảnh chuyển động và finalize; báo frame loss, memory slope, peak RAM, CPU, thông tin máy và codec.
- [ ] Không đạt mục tiêu thì ghi nguyên nhân và task sửa cụ thể trước checkpoint; không tự giảm fps/resolution để báo đạt.

**Verification:**
- [ ] node scripts/recording-benchmark.mjs --minutes 60; dùng dữ liệu thực, chưa đánh dấu đạt yêu cầu 2 giờ.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 7, 8

**Files likely touched:**
- `scripts/recording-benchmark.mjs`
- `tests/fixtures/recording-motion.html`
- `.agents/plans/record/benchmark.md`

**Estimated scope:** Medium (3–5 files).

## Checkpoint: Sau Task 7–9

- [ ] Gate quay dài sớm: WebM seek được, benchmark 1 giờ có số liệu; giải quyết lỗi hiệu năng trước crop.
- [ ] Typecheck, toàn bộ unit tests, build và E2E liên quan pass.
- [ ] Review bằng chứng, cập nhật rủi ro/ước lượng; xử lý lỗi trước nhóm tiếp theo.

## Task 10: Quy đổi vùng sang pixel video

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 10

**Description:** Tách geometry recording một màn hình với frame size thực và rounding phù hợp codec.

**Acceptance criteria:**
- [ ] Xử lý origin âm, portrait, scale 1/1.25/1.5/2 và frame downscale; từ chối vùng vượt source hoặc không hữu hạn.
- [ ] Crop native sai số mỗi cạnh ≤2 px, kích thước chẵn và tối thiểu 100×100 pixel nguồn; không lấy scale lớn nhất desktop.
- [ ] Phân biệt crop và output resize; thay đổi nguồn/geometry làm vùng cũ mất hiệu lực.

**Verification:**
- [ ] pnpm.cmd test -- tests/recording-geometry.test.ts; case mixed DPI và biên lẻ.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 9

**Files likely touched:**
- `shared/recording-geometry.ts`
- `tests/recording-geometry.test.ts`

**Estimated scope:** Small (1–2 files).

## Task 11: Chọn vùng quay trên overlay

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 11

**Description:** Cho phép chọn/chỉnh vùng trước khi quay với overlay riêng của recording.

**Acceptance criteria:**
- [ ] Overlay phủ đúng một màn hình, kéo/chỉnh cạnh, Enter xác nhận, Esc hủy; hiển thị kích thước pixel và preview tạm.
- [ ] Main xác nhận vùng theo source/session, chỉ overlay hiện tại gửi region:selected; đóng overlay trước capture.
- [ ] Không ảnh hưởng overlay screenshot; dùng tọa độ đã kiểm thử, không cho vùng vượt nhiều màn hình.

**Verification:**
- [ ] pnpm.cmd exec playwright test tests/e2e/recording-region.spec.ts; manual hai màn hình DPI khác nhau.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 10

**Files likely touched:**
- `src/recording/RegionOverlay.tsx`
- `src/recording/Setup.tsx`
- `electron/recording/windows.ts`
- `electron/recording/controller.ts`
- `tests/e2e/recording-region.spec.ts`

**Estimated scope:** Medium (3–5 files).

## Task 12: Quay video đúng vùng

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 12

**Description:** Nối processor/crop/generator vào MediaRecorder theo kết quả spike.

**Acceptance criteria:**
- [ ] Full và region đều tạo WebM hoàn chỉnh; crop khớp lưới nguồn ≤2 px, output resize giữ tỉ lệ.
- [ ] Frame ownership, timestamps, abort và generator backpressure được xử lý; queue có giới hạn, không phụ thuộc setup rAF.
- [ ] Đo crop 30 phút không có RAM tăng tuyến tính; thiếu API có lỗi rõ hoặc fallback đã benchmark, không âm thầm quay toàn màn hình.

**Verification:**
- [ ] pnpm.cmd test -- tests/recording-crop.test.ts; pnpm.cmd exec playwright test tests/e2e/recording-crop.spec.ts; manual pixel và benchmark 30 phút.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 11

**Files likely touched:**
- `src/recording/crop-track.ts`
- `src/recording/Recorder.tsx`
- `tests/recording-crop.test.ts`
- `tests/e2e/recording-crop.spec.ts`

**Estimated scope:** Medium (3–5 files).

## Checkpoint: Sau Task 10–12

- [ ] Vùng quay: pixel match trên mixed DPI, quay crop 30 phút và lifecycle frame được xác minh.
- [ ] Typecheck, toàn bộ unit tests, build và E2E liên quan pass.
- [ ] Review bằng chứng, cập nhật rủi ro/ước lượng; xử lý lỗi trước nhóm tiếp theo.

## Task 13: Chọn mic và xem mức âm

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 13

**Description:** Bổ sung mic preview khi setup và hướng dẫn quyền theo trạng thái thật.

**Acceptance criteria:**
- [ ] Chọn thiết bị, cập nhật devicechange, meter hoạt động và hướng dẫn denied/not-readable; cho chọn quay không mic khi lỗi.
- [ ] Preview không tạo feedback ra loa, không ghi file; đóng setup hoặc chuyển sang recording giải phóng preview.
- [ ] Không xin mic nếu user tắt; settings mic cũ biến mất không tự thay bằng thiết bị khác mà không thông báo.

**Verification:**
- [ ] pnpm.cmd exec playwright test tests/e2e/recording-mic-setup.spec.ts; manual denied, device busy, cắm/rút mic.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 12

**Files likely touched:**
- `src/recording/MicSettings.tsx`
- `src/recording/audio.ts`
- `src/recording/Setup.tsx`
- `electron/recording/controller.ts`
- `tests/e2e/recording-mic-setup.spec.ts`

**Estimated scope:** Medium (3–5 files).

## Task 14: Ghi mic và mute trong phiên

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 14

**Description:** Ghép audio graph với video, điều khiển gain bằng trạng thái main.

**Acceptance criteria:**
- [ ] File có tiếng mic với các constraints đã yêu cầu; gain=0 tạo im lặng khi mute, không thay tập track của recorder.
- [ ] Rút mic giữa phiên tiếp tục video với cảnh báo; pause/resume không làm lệch A/V, thiết bị không tự đổi giữa phiên.
- [ ] Stop/error đóng AudioContext và tracks; verify đồng bộ âm/hình ≤100 ms đầu/giữa/cuối.

**Verification:**
- [ ] pnpm.cmd exec playwright test tests/e2e/recording-audio.spec.ts; manual mic thật và fixture tiếng/beep đồng bộ hình.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 13

**Files likely touched:**
- `src/recording/audio.ts`
- `src/recording/Recorder.tsx`
- `electron/recording/controller.ts`
- `src/recording/Setup.tsx`
- `tests/e2e/recording-audio.spec.ts`

**Estimated scope:** Medium (3–5 files).

## Task 15: Điều khiển qua tray và hotkey

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 15

**Description:** Đưa pause/stop/mute vào đường điều khiển không phụ thuộc setup.

**Acceptance criteria:**
- [ ] Ctrl+Shift+2 dừng, Ctrl+Shift+3 pause/resume; xung đột hotkey ảnh và app khác được báo, đăng ký thất bại rollback.
- [ ] Tray hiển thị đúng state/elapsed và nút hợp lệ; stop hoạt động khi setup bị ẩn/đóng.
- [ ] Đang recording chặn capture ảnh mới, không xóa bản ảnh chưa lưu; test regression phím tắt screenshot.

**Verification:**
- [ ] pnpm.cmd test -- tests/recording-shortcuts.test.ts; pnpm.cmd exec playwright test tests/e2e/recording-hotkeys.spec.ts tests/e2e/native-hotkeys.spec.ts.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 14

**Files likely touched:**
- `electron/recording/controls.ts`
- `electron/main.ts`
- `tests/recording-shortcuts.test.ts`
- `tests/e2e/recording-hotkeys.spec.ts`

**Estimated scope:** Medium (3–5 files).

## Checkpoint: Sau Task 13–15

- [ ] Mic và điều khiển: mic thật, pause/mute, tray/hotkey khi app ẩn, regression capture.
- [ ] Typecheck, toàn bộ unit tests, build và E2E liên quan pass.
- [ ] Review bằng chứng, cập nhật rủi ro/ước lượng; xử lý lỗi trước nhóm tiếp theo.

## Task 16: Theo dõi dung lượng đĩa

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 16

**Description:** Thêm preflight và monitor đĩa trong toàn phiên, dùng ngưỡng theo đặc tả.

**Acceptance criteria:**
- [ ] Cảnh báo trước Start khi trống <5 GB, kiểm tra mỗi 30 giây, tự stop khi <500 MB; kiểm tra lại sau countdown.
- [ ] ENOSPC giữa hai lần poll và hết chỗ khi finalize có đường lỗi giữ .part; tính dự phòng remux theo kích thước file thực.
- [ ] UI hiển thị ước tính dung lượng có tính audio/overhead; timers được dọn, fs.statfs dùng đúng volume đích.

**Verification:**
- [ ] pnpm.cmd test -- tests/recording-disk.test.ts; pnpm.cmd exec playwright test tests/e2e/recording-disk.spec.ts; fault injection, không làm đầy đĩa thật.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 15

**Files likely touched:**
- `electron/recording/disk.ts`
- `electron/recording/controller.ts`
- `src/recording/Setup.tsx`
- `tests/recording-disk.test.ts`
- `tests/e2e/recording-disk.spec.ts`

**Estimated scope:** Medium (3–5 files).

## Task 17: Dừng an toàn khi hệ thống thay đổi

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 17

**Description:** Tích hợp lifecycle app/nguồn và cleanup thống nhất.

**Acceptance criteria:**
- [ ] Quit đợi stop/finalize; recorder crash có timeout và giữ partial; setup crash không tự dừng stream recorder còn tốt.
- [ ] Unplug/đổi DPI màn hình, track ended, lock/suspend kích hoạt đường xử lý đã chốt; không đổi sang màn hình khác.
- [ ] Power blocker tồn tại đúng thời gian quay, tài nguyên được release sau lỗi; lỗi IPC/permission hiển thị có cách thử lại.

**Verification:**
- [ ] pnpm.cmd test -- tests/recording-lifecycle.test.ts; pnpm.cmd exec playwright test tests/e2e/recording-failure.spec.ts; manual lock/suspend/unplug.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 16

**Files likely touched:**
- `electron/recording/lifecycle.ts`
- `electron/recording/controller.ts`
- `electron/main.ts`
- `tests/recording-lifecycle.test.ts`
- `tests/e2e/recording-failure.spec.ts`

**Estimated scope:** Medium (3–5 files).

## Task 18: Khôi phục bản ghi dở dang

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 18

**Description:** Phát hiện journal của ứng dụng và cho người dùng hoàn tất lại phần còn đọc được.

**Acceptance criteria:**
- [ ] Startup liệt kê chỉ bản ghi thuộc app ở các đích đã dùng; chọn recover rõ ràng, không sửa file .part không thuộc app.
- [ ] Khôi phục prefix container hoàn chỉnh vào file kết quả riêng với duration/seek; file hỏng không cứu được có lý do rõ và giữ bản gốc.
- [ ] Test renderer/main crash, journal hỏng, missing header, truncated cluster, permission lỗi, disk full và retry idempotent.

**Verification:**
- [ ] pnpm.cmd test -- tests/recording-recovery.test.ts; kill test instance đang ghi rồi mở lại và kiểm tra file trong 3 player.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 17

**Files likely touched:**
- `electron/recording/recovery.ts`
- `electron/recording/controller.ts`
- `src/recording/RecoveryPanel.tsx`
- `src/recording/Setup.tsx`
- `tests/recording-recovery.test.ts`

**Estimated scope:** Medium (3–5 files).

## Checkpoint: Sau Task 16–18

- [ ] Độ bền: disk/crash/unplug/suspend/recovery và finalize thiếu chỗ đã kiểm chứng.
- [ ] Typecheck, toàn bộ unit tests, build và E2E liên quan pass.
- [ ] Review bằng chứng, cập nhật rủi ro/ước lượng; xử lý lỗi trước nhóm tiếp theo.

## Task 19: Lưu cấu hình recording

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 19

**Description:** Lưu lựa chọn setup và hotkey, có migration tương thích settings ảnh.

**Acceptance criteria:**
- [ ] Persist nguồn/vùng/mic/thư mục/hotkey/countdown qua schema recording, không mất shortcuts/lastDirectory của screenshot.
- [ ] Display/device/path không còn tồn tại có fallback rõ; vùng được revalidate khi đổi nguồn/DPI.
- [ ] Save thất bại hoặc hotkey xung đột rollback nhất quán; cấu hình malformed dùng default có cảnh báo.

**Verification:**
- [ ] pnpm.cmd test -- tests/settings.test.ts; manual reopen app với settings cũ và thay đổi thiết bị.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 15, 18

**Files likely touched:**
- `electron/settings.ts`
- `shared/recording-contracts.ts`
- `electron/recording/controller.ts`
- `src/recording/Setup.tsx`
- `tests/settings.test.ts`

**Estimated scope:** Medium (3–5 files).

## Task 20: Hiển thị kết quả và mở file

**Status:** needs review — implementation available; evidence in acceptance-report.md

- [ ] Hoàn thành Task 20

**Description:** Hoàn thiện luồng từ recording:finished đến mở file/thư mục và quay tiếp.

**Acceptance criteria:**
- [ ] Kết quả hiển thị tên, size, duration, cảnh báo nếu partial/recovered; finalizing và error không hiển thị thành công.
- [ ] Mở file/folder chỉ bằng resultId do main cấp, resolve tới file của app; truyền arbitrary path bị từ chối.
- [ ] Quay tiếp trở về idle/setup sạch; trạng thái UI chỉ theo snapshot main, subscriptions không tích lũy.

**Verification:**
- [ ] pnpm.cmd exec playwright test tests/e2e/recording-result.spec.ts; manual native dialog, open file/folder và 10 phiên liên tiếp.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 19

**Files likely touched:**
- `src/recording/ResultPanel.tsx`
- `src/recording/Setup.tsx`
- `electron/recording/controller.ts`
- `src/stores/recording.ts`
- `tests/e2e/recording-result.spec.ts`

**Estimated scope:** Medium (3–5 files).

## Task 21: Nghiệm thu hai giờ và đóng gói Windows

**Status:** needs review — long-run acceptance not executed

- [ ] Hoàn thành Task 21

**Description:** Chạy toàn bộ gate trên bản packaged, xuất báo cáo tái lập được và hướng dẫn dùng.

**Acceptance criteria:**
- [ ] Hai phiên ≥2 giờ full+mic và crop+mic đạt tiêu chí task.md; báo cold start, all-process RAM/CPU, frame loss, A/V và finalize/recovery peak.
- [ ] Ma trận DPI, multi-monitor, denied mic, disk lỗi, crash/recovery, pause và các player hoàn tất; toàn bộ regression screenshot pass.
- [ ] pnpm dist tạo installer Windows x64 chạy được; lưu báo cáo và screenshot UI từ fixture; không publish tự động.

**Verification:**
- [ ] pnpm.cmd typecheck; pnpm.cmd test; pnpm.cmd test:e2e; pnpm.cmd dist; soak opt-in với timeout >2 giờ, workers=1, mỗi phiên >=120 phút trên máy chuẩn.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 1–20

**Files likely touched:**
- `scripts/recording-benchmark.mjs`
- `tests/e2e/recording-soak.spec.ts`
- `documentation/recording.md`
- `.agents/plans/record/acceptance-report.md`

**Estimated scope:** Medium (3–5 files).

## Checkpoint: Sau Task 19–21

- [ ] Nghiệm thu lõi: hai phiên 2 giờ, file >5 GB, toàn bộ ma trận và installer có bằng chứng.
- [ ] Typecheck, toàn bộ unit tests, build và E2E liên quan pass.
- [ ] Review bằng chứng, cập nhật rủi ro/ước lượng; xử lý lỗi trước nhóm tiếp theo.

## Task 22: Thanh điều khiển nổi (tùy chọn)

**Status:** deferred (optional)

- [ ] Hoàn thành Task 22 (tùy chọn)

**Description:** Thêm cửa sổ gọn sau khi tray/hotkey và output ổn định.

**Acceptance criteria:**
- [ ] Hiển thị elapsed, pause/resume, mute, stop theo snapshot main; không sở hữu stream.
- [ ] Content protection được kiểm chứng bằng frame output ở full và region; tắt tính năng nếu không loại được UI khỏi video.
- [ ] Đóng thanh nổi vẫn tiếp tục quay và điều khiển qua tray; không làm vượt gate RAM/CPU.

**Verification:**
- [ ] pnpm.cmd exec playwright test tests/e2e/recording-control-bar.spec.ts; kiểm tra pixel và lặp benchmark nếu thêm vào bản phát hành.
- [ ] Build: pnpm.cmd build; áp dụng verification chung và lưu bằng chứng cần thiết.

**Dependencies:** 15, 20, 21

**Files likely touched:**
- `src/recording/ControlBar.tsx`
- `electron/recording/windows.ts`
- `electron/recording/controls.ts`
- `src/App.tsx`
- `tests/e2e/recording-control-bar.spec.ts`

**Estimated scope:** Medium (3–5 files).
