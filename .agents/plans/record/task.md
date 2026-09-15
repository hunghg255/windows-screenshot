# Implementation Plan: Quay màn hình dài trên desktop

Ngày: 2026-09-15. Trạng thái: **needs review**. Người dùng đã duyệt triển khai bằng “implement đi”.
Task list chính: [todo.md](./todo.md). Đặc tả đầu vào: [plan.md](./plan.md), giữ nguyên.
Các bổ sung mới nhất của người dùng về luồng dữ liệu, state machine và IPC được đưa vào kế hoạch này.

## Overview

Thêm khả năng quay toàn bộ **một màn hình được chọn** hoặc một vùng trên màn hình đó vào ứng dụng screenshot hiện có; mic tùy chọn; pause/resume; ghi WebM dần xuống đĩa; hoàn tất metadata, seek index và khôi phục bản ghi dở dang. Mục tiêu là quay ít nhất 2 giờ với bộ nhớ có giới hạn. Không khởi tạo project mới.

Giả định phạm vi: Windows 10/11 x64 theo AGENTS.md và đầu bản đặc tả. Hỗ trợ scale 100%, 125%, 150%, 200%; Retina trên macOS là câu hỏi phạm vi đang chờ trả lời, không được đánh dấu đạt bằng test Windows 200%. Chưa gồm MP4, âm thanh hệ thống, webcam, quay cửa sổ riêng, biên tập video hoặc cloud. Thanh điều khiển nổi là tùy chọn sau lõi bắt buộc. Không tự thêm ký số, notarization hay CI macOS từ những mục mâu thuẫn trong đặc tả gốc.

## Codebase đã khảo sát

| Có sẵn | Cách dùng |
|---|---|
| Electron 44.3.0, React 19, TypeScript, Vite, pnpm 8.15.9 | Giữ build và cấu trúc hiện có; xác minh API trên Electron đã pin |
| electron/main.ts | Tích hợp route/cửa sổ mới, tray, vòng đời; hiện permission handlers từ chối mọi quyền |
| electron/preload.cts, shared/contracts.ts | Giữ API screenshot; thêm bridge recording có kiểu, kiểm tra sender/frame/role |
| electron/session.ts | CaptureSession dành cho ảnh; tạo RecordingSession riêng |
| shared/desktop-geometry.ts | Hiện ghép nhiều màn hình theo scale lớn nhất; không dùng trực tiếp cho crop video một nguồn |
| src/capture/SelectionOverlay.tsx | Overlay ảnh tĩnh, thả chuột là hoàn tất; vùng quay cần overlay và lifecycle riêng |
| src/App.tsx | Route theo hash; thêm dispatch sớm cho recorder để không gọi screenshot.current() |
| electron/settings.ts, electron/shortcuts.ts | Mở rộng tương thích settings cũ, kiểm tra xung đột hotkey |
| Vitest, Playwright | Unit tests tại tests/*.test.ts; E2E desktop có timeout mặc định 60 giây |

## Architecture Decisions

### Cửa sổ và quyền sở hữu

- Main giữ trạng thái gốc, session ID, cấu hình đã xác thực, nơi lưu file, writer, timer đĩa và lịch sử kết quả. Renderer chỉ gửi ý định; Zustand là bản sao snapshot của main.
- Setup chọn nguồn/mic và hiển thị tiến độ. Overlay vùng quay giới hạn trong màn hình đã chọn. Recorder dùng BrowserWindow riêng, show:false, backgroundThrottling:false; không phụ thuộc requestAnimationFrame của UI.
- Recorder giữ stream, xử lý crop, Web Audio và MediaRecorder. Spike phải chứng minh getDisplayMedia từ thao tác Start qua IPC vẫn hoạt động trong cửa sổ ẩn, kể cả yêu cầu user activation. Chưa coi việc tách cửa sổ là bảo đảm không rớt frame.
- Cùng entry Vite với các route riêng và dynamic import để không tải editor/canvas ảnh vào recorder; chỉ thêm entry riêng nếu spike chứng minh cần thiết.
- Giữ sandbox, contextIsolation, nodeIntegration:false và giới hạn navigation. Permission check/request handlers chỉ cho đúng recorder hoặc mic preview được cấp phép; ràng buộc nguồn với phiên đang chuẩn bị, không cấp nguồn mặc định cho mọi renderer.
- Chỉ ghi sau khi người dùng chọn đích lưu và bấm Quay; Start được mô tả rõ là bắt đầu lưu video. Không persist thumbnail/ảnh preview. Không log frame, audio, video hoặc upload dữ liệu. Khi quay, chặn khởi tạo capture/editor mới để tránh đột biến RAM và overlay ảnh lọt vào video; không tự xóa phiên ảnh đang chỉnh sửa.

### Video và audio

- Cập nhật triển khai: toàn màn hình cũng đi qua processor/generator; bỏ frame trong một giây để nguồn capture Windows ổn định trước khi bắt đầu encode. Vùng quay: track processor → VideoFrame crop → **track generator** → MediaRecorder. VideoFrame một mình không tạo MediaStreamTrack; spike chọn API generator thực sự có trên bản Electron pin.
- Crop sử dụng kích thước frame thực tế và bounds nguồn tương ứng, không nhân scaleFactor một cách máy móc khi capture bị downscale. Trừ origin màn hình (có thể âm), clamp, làm tròn cạnh phù hợp codec, kiểm tra sai số tối đa 2 pixel nguồn.
- Chọn vùng trước, rồi áp giới hạn output 1080p30, giữ aspect ratio. Test sai số pixel chạy chế độ native để không trộn lỗi crop với lỗi resize. Fullscreen 4K cần probe đường resize riêng.
- close() mọi input/output VideoFrame khi hết quyền sở hữu, kể cả lỗi/abort; giữ timestamp và chờ writer readiness; giới hạn frame in-flight.
- Probe VP8 trước VP9 bằng isTypeSupported và thử khởi tạo thực tế; Opus khi có mic. Mốc 6 Mbps ở 1080p là cấu hình khởi điểm, không cam kết hardware encoding hay CPU trước benchmark.
- Mic → GainNode → MediaStreamAudioDestinationNode; nhánh AnalyserNode hiển thị mức âm. Mute bằng gain, không đổi tập track khi MediaRecorder đang chạy. Khóa lựa chọn thiết bị trong phiên; rút mic tiếp tục video và output audio im lặng nếu có thể, hiện cảnh báo.
- Dừng preview mic trước khi recorder lấy thiết bị; giải phóng stream, AudioContext, worker và listeners khi kết thúc.

### Chunk và ghi file có giới hạn

- MediaRecorder.start(1000) đặt nhịp mục tiêu; không coi mỗi chunk đúng 1 giây hoặc có kích thước cố định.
- recording:chunk mang sessionId, sequence, bytes. Main chỉ nhận từ recorder đã bind; ACK theo tiến độ writer và drain, không ACK ngay khi đẩy vào mảng. Promise invoke không tự ngăn các dataavailable handler chạy đồng thời.
- Điểm khởi đầu để đo: tối đa 2 IPC in-flight, tổng ứng dụng xếp hàng 32 MiB mỗi phía, giới hạn payload 8 MiB; Blob lớn được đọc/chia tuần tự, không chuyển toàn bộ Blob rất lớn sang ArrayBuffer. Kiểm chứng cả bộ đệm browser ngoài các hàng đợi này.
- Chậm đĩa kéo dài hoặc vượt ngân sách: dừng có kiểm soát và báo lỗi; không bỏ chunk tùy ý, không tự pause rồi báo thành công vì có thể mất thời gian nội dung. Nếu không thể xả hết thì giữ .part và ghi nhận bản ghi chưa hoàn chỉnh.
- Tạo file độc quyền .webm.part và journal gọn bằng main; từ chối trùng tên, path do renderer tự cung cấp, sequence thiếu/trùng/khác phiên.
- Stop: main chuyển stopping → recorder.stop() → dataavailable cuối → stop event → gửi endOfStream(lastSequence) → main đợi đủ chunk/ACK → WriteStream.end/finish, đóng handle → finalizing → kiểm tra container → finalize → rename → done/finished. Duplicate stop idempotent; timeout có lỗi rõ ràng, không phát finished sai.

### WebM, duration và khôi phục

- Vá duration chưa phải toàn bộ tiêu chí seek. Spike kiểm tra EBML/Info/Duration, Cluster timecodes, Cues/SeekHead và offsets trên output thực tế.
- Ưu tiên parser theo stream + patch tại chỗ khi có vùng header hợp lệ; nếu cần thêm metadata/index, remux/copy theo stream sang file tạm cùng thư mục và đổi tên sau khi kiểm chứng. Không đọc cả file, không dùng thư viện chỉ nhận Blob toàn video.
- Cues/index có thể lưu sidecar rồi append theo stream; tránh một danh sách keyframe tăng vô hạn trong RAM. Remux chỉ đổi container, không encode lại.
- Duration lấy từ timeline media của container, đối chiếu thời gian active ở main (loại pause). Không tính bằng số chunk × 1000.
- Tính cả dung lượng file tạm khi remux: không giả định mức dự phòng 500 MB đủ cho bản ghi >5 GB. Nếu thiếu chỗ, giữ .part và hỗ trợ hoàn tất lại; tuyệt đối không báo thành công.
- Recovery chỉ duyệt journal/file thuộc ứng dụng trong các đích đã dùng, không sửa mọi .part tìm thấy. Trình bày cho người dùng chọn khôi phục; đọc đến phần container hoàn chỉnh cuối cùng và tạo kết quả riêng. Không hứa cứu phần chưa flush hoặc file không có header hợp lệ.
- Main sở hữu finalization nhưng I/O phải async; parse nặng cần worker để không chặn tray/IPC.

### Máy trạng thái chuẩn

~~~text
idle → ready                         (chọn toàn màn hình hợp lệ)
idle/ready → selecting-region → ready
selecting-region → idle/ready        (Esc/hủy, trả về trạng thái trước)
ready → countdown → recording ⇄ paused
countdown → ready                   (hủy)
recording/paused → stopping → finalizing → done → idle
mọi trạng thái hoạt động → error → idle
~~~

- Nếu countdown tắt, ready → recording chỉ sau ACK khởi động thực tế; nếu bật, main quản deadline 3 giây, chỉ chuyển recording khi recorder xác nhận.
- Snapshot gồm sessionId, revision, state, mode/source/region, elapsedActiveMs, muted, bytesWritten, warning/error, resultId. Cửa sổ mở lại lấy snapshot ban đầu rồi bỏ revision cũ.
- Command có requestId; idempotency và watchdog cho start/pause/resume/stop; recorder bị crash dùng error + recovery, không chờ vô hạn.
- Quit đang quay đi qua stop/finalize rồi thoát. display-removed, đổi geometry, track ended, khóa máy/suspend phải có hành vi được kiểm chứng; mặc định dừng và lưu phần đã có. powerSaveBlocker ngăn idle sleep trong phiên, không bảo đảm chống forced suspend.

### IPC: giữ các tên đã yêu cầu

| Kênh | Quyền/semantics |
|---|---|
| sources:list | Setup → main; màn hình + thumbnail tạm, ánh xạ display_id |
| region:open / region:selected | Setup → main / overlay đúng phiên → main; Rect hoặc null |
| recording:start | Setup → main; validate cấu hình, đích lưu và nguồn trước khi quay |
| recording:pause / recording:resume / recording:stop | UI → main; main phát command tới recorder; ACK trả về main |
| recording:chunk | Recorder → main; sequence + bytes, ACK có backpressure |
| recording:state | Main → UI; snapshot có revision |
| recording:finished | Main → UI; chỉ sau finalize/rename thành công, resultId + đường dẫn hiển thị |
| disk:check | Setup → main; kiểm tra đích lưu đã chọn |
| settings:get / settings:set | Setup ↔ main; chỉ schema recording, giữ API settings ảnh cũ |
| permissions:check | Setup → main; trạng thái thực/unknown và hướng dẫn, không tự xin mọi quyền |
| shell:open-file / shell:open-folder | Setup → main; resolve resultId tin cậy, không nhận đường dẫn tùy ý |

Bổ sung tối thiểu cần thiết: recording:get-state; recording:command và recording:ack; recording:end (lastSequence); recording:error; recording:mute; recording:choose-directory; recording:recovery-list và recording:recover. Mic preview/meter đi qua bridge hẹp nếu recorder sở hữu preview. Chốt schema khi làm Task 2; không expose ipcRenderer/send tùy ý.

## Task List

Danh sách có tiêu chí và verification tại [todo.md](./todo.md).

1. Task 1–3: kiểm chứng API/container, contract, state machine.
2. Task 4–6: writer, recorder route, đường quay toàn màn hình đầu tiên.
3. Task 7–9: finalize seekable, pause/countdown, benchmark 1 giờ.
4. Task 10–12: tọa độ, overlay, crop video.
5. Task 13–15: chọn mic, audio trong bản ghi, tray/hotkey.
6. Task 16–18: đĩa, vòng đời lỗi, recovery.
7. Task 19–21: settings, kết quả file, nghiệm thu/đóng gói.
8. Task 22: thanh nổi tùy chọn, sau lõi.

Mỗi nhóm có checkpoint. Các nền tảng đầu tiên là ngoại lệ cần thiết trước các lát chức năng chạy xuyên suốt. Không dựng toàn bộ UI trước khi chứng minh ghi/finalize. Ước lượng sơ bộ 5–7 tuần cho một lập trình viên và thiết bị test sẵn có, không phải cam kết; cập nhật sau spike. Hai bài soak bắt buộc riêng (full/mic, crop/mic) chiếm ít nhất 4 giờ máy thực, chưa kể lặp khi có lỗi.

## Tiêu chí nghiệm thu và cách đo

| Mục tiêu | Phương pháp/điều kiện |
|---|---|
| ≥2 giờ không crash/rớt frame rõ rệt | Hai phiên full và crop ở 1080p30 + mic, có pause/resume/mute; cảnh chuyển động có timecode. Đề xuất ngưỡng mất frame ≤1%, không đóng băng >250 ms ngoài pause; review ngưỡng trước nghiệm thu |
| RAM <500 MB và không tăng dần | Tổng private working set các process app (main, renderer, GPU, utility), không chỉ JS heap; log số liệu mỗi 5 giây, tổng hợp 5 phút; đo cả finalize/recovery và lặp 10 phiên start/stop. Sau warmup 10 phút, độ dốc đề xuất ≤5 MB/giờ và mọi mẫu <500 MB |
| CPU <30% tại 1080p30 | Tổng CPU của app quy về toàn máy, trung bình mỗi 60 giây và toàn phiên; báo thêm p95. Ghi rõ CPU 4 nhân đời 2020+, GPU/driver, RAM, OS, power mode và codec |
| WebM seek/duration đúng | Chrome, Firefox, VLC phiên bản ghi trong report; seek 10/50/90% và sát cuối file >5 GB; sai số duration đề xuất ≤max(100 ms, 1 frame); A/V lệch ≤100 ms ở đầu/giữa/cuối |
| Crop lệch ≤2 px | Mẫu lưới nguồn ở native resolution, origin âm, portrait, DPI hỗn hợp 100/125/150/200%; đo các cạnh, không chỉ xem thumbnail |
| Mở app → frame đầu <10 giây | Cold launch, nguồn/đích đã hợp lệ, tính countdown; báo riêng lần đầu có thao tác người dùng/quyền/dialog. Không loại thời gian hệ thống tự xử lý |

Các ngưỡng đề xuất làm rõ tiêu chí mơ hồ, cần review cùng kế hoạch. Test giả lập không thay thế soak máy thực. Ghi metrics không chứa nội dung màn hình/âm thanh; E2E dùng cảnh fixture, tránh tự lưu trace/screenshot màn hình cá nhân.

## Risks and Mitigations

| Rủi ro | Mức độ | Xử lý |
|---|---|---|
| Capture trong recorder ẩn/user activation/API generator không tương thích | Cao | Task 1 trên Electron pin, kiểm thử đóng gói và khi UI bị thu nhỏ; ghi rõ fallback nếu cần |
| Encoder/crop vượt CPU hoặc RAM | Cao | Đo sớm Task 9, bỏ qua crop khi không cần; không tự giảm fps rồi tuyên bố đạt 1080p30 |
| MediaRecorder tạo Blob lớn khi stall | Cao | Giới hạn queue, phân mảnh tuần tự, kiểm tra overflow/timeout và bộ đệm browser |
| Duration có nhưng seek không ổn | Cao | Cues/SeekHead + parser streaming, kiểm tra file lớn thực trên 3 player |
| Disk full trong remux | Cao | Tính dung lượng file tạm, giữ .part và retry; không đánh đồng cảnh báo 500 MB với đảm bảo finalize |
| DPI/screen change lộ vùng ngoài lựa chọn | Cao | Tọa độ từ frame thật, test pixel; dừng khi nguồn thay đổi thay vì tự chọn nguồn khác |
| Crash/suspend mất chunk cuối | Cao | End barrier, watchdog, journal, phục hồi prefix hợp lệ |
| contentProtection không loại thanh nổi như kỳ vọng | Trung bình | Test pixel trên Windows target; tắt thanh nổi khi thất bại |
| Nới quyền ảnh hiện có hoặc hỏng hotkey | Cao | ACL theo role, regression E2E screenshot và rollback đăng ký shortcut |
| Đặc tả gốc lẫn Windows và macOS | Trung bình | Windows-first là giả định; tách milestone macOS nếu người dùng yêu cầu |

## Open Questions / Review

- Xác nhận Windows-first hay gồm macOS/Retina. Nếu gồm macOS: thêm gói quyền/TCC, signing/notarization và ma trận Intel/Apple Silicon; chưa được coi là xong bằng checklist Windows.
- Xác nhận các định nghĩa đo RAM/CPU/drop frame/duration ở trên.
- Máy benchmark chuẩn cụ thể và thiết bị DPI hỗn hợp sẽ dùng khi nghiệm thu.
- Thanh nổi có cần trong MVP hay để sau tray/hotkey?
- Khả năng crop/generator và phương án container cuối cùng sẽ chốt bằng Task 1, không suy đoán từ API mới nhất.

## Phụ thuộc và cơ hội làm song song

Chuỗi chính: 1 → 2 → 3 → 4/5 → 6 → 7 → 8 → 9 → 10 → 11 → 12.
Sau 12: audio 13→14 và độ bền 16→17→18 có thể giao các phiên độc lập khi schema đã ổn định; cần phối hợp vì cùng sửa controller.ts.
Task 19→20 dựa vào hợp đồng/settings và kết quả ổn định. Task 21 chờ tất cả Task 1–20.
Task 22 optional sau 15, 20. Chưa giao agent hoặc bắt đầu code ở bước lập kế hoạch.

## Nguồn kỹ thuật

Kiểm tra ngày 2026-09-15; tài liệu latest là tham khảo, spike phải dùng Electron 44.3.0 thực tế.

- [Electron session: display media và permission handlers](https://www.electronjs.org/docs/latest/api/session#setdisplaymediarequesthandlerhandler-opts): handler chọn nguồn, cần kiểm tra frame; permission check và request phải nhất quán.
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window): tùy chọn cửa sổ, throttling và content protection.
- [W3C MediaStreamTrack processing](https://www.w3.org/TR/mediacapture-transform/): processor/generator và vòng đời frame.
- [W3C MediaStream Recording](https://www.w3.org/TR/mediastream-recording/): dataavailable, timeslice, pause/stop; các chunk riêng không nhất thiết phát độc lập.
- [Matroska Cues](https://www.matroska.org/technical/cues.html): chỉ mục phục vụ seek.
- [Node streams](https://nodejs.org/api/stream.html): write/drain và backpressure.

## Hoàn tất bước planning

- Đã khảo sát code và bản đặc tả đang tồn tại; không ghi đè plan.md.
- task.md ghi quyết định/rủi ro; todo.md là checklist triển khai chính.
- Chưa chạy build/test vì chỉ tạo tài liệu; kết quả runtime/benchmark chưa được xác minh.
- Chưa được người dùng duyệt để triển khai. Skill planning-and-task-breakdown yêu cầu: “The human has reviewed and approved the plan” trước khi bắt đầu implementation.


## Implementation review — 2026-09-15

Code và bản đóng gói Windows đã có. Xem [acceptance-report.md](acceptance-report.md) cho file thực tế, kết quả kiểm thử và các tiêu chí chưa nghiệm thu. Những đường dẫn/test dự kiến trong kế hoạch được hợp nhất theo báo cáo. Mốc một giờ/hai giờ, file trên 5 GB, DPI vật lý và Firefox/VLC còn chưa chạy; Task 22 tùy chọn được hoãn.
