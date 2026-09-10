# Task list: Windows Screenshot

Xem [kế hoạch](task.md). Trạng thái: baseline đã triển khai; checkbox nghiệm thu lịch sử giữ nguyên. Phần bổ sung Task 16–22 chưa triển khai.

Các script pnpm đã tồn tại; dùng pnpm.cmd nếu PowerShell chặn script. File liệt kê là phạm vi dự kiến; tách task nếu phát sinh trên khoảng 5 file nguồn hoặc nhiều subsystem độc lập. Test chỉ dành cho hành vi/rủi ro; task cấu hình thuần túy dùng build và smoke.

## Task 01: Runtime Electron và IPC

- [ ] Hoàn thành Task 01.

**Description:** Khởi tạo TypeScript main/preload, dependency và lockfile.

**Acceptance criteria:**
- [ ] Electron stable latest lúc cài được pin, React 19 và Vite 8 đúng major.
- [ ] App mở cửa sổ local; sandbox/contextIsolation bật, nodeIntegration tắt.
- [ ] Bridge chỉ expose API được định nghĩa; build main/preload thành công.

**Verification:**
- [ ] pnpm typecheck; pnpm build:electron.
- [ ] Manual check: Mở Electron và kiểm tra bridge hạn chế.

**Dependencies:** Không.

**Files likely touched:**
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`
- `electron/main.ts`
- `electron/preload.cts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Task 02: Renderer và công cụ build

- [ ] Hoàn thành Task 02.

**Description:** Dựng React/Vite, Tailwind 4, shadcn/ui và Zustand.

**Acceptance criteria:**
- [ ] Dev và production đều mở được UI React có style.
- [ ] Zustand quản lý trạng thái mẫu; shadcn component hiển thị đúng.
- [ ] Có scripts dev/build/typecheck/test không watch; cấu hình test trong vite.config.ts.

**Verification:**
- [ ] pnpm typecheck; pnpm build.
- [ ] Manual check: Mở cả dev và bản build; component UI sinh tự động có thể bổ sung file, tách việc nếu vượt một phiên.

**Dependencies:** 01.

**Files likely touched:**
- `vite.config.ts`
- `index.html`
- `src/main.tsx`
- `src/styles.css`
- `package.json`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Task 03: Chụp toàn màn hình

- [ ] Hoàn thành Task 03.

**Description:** Spike capture backend và hiển thị ảnh thật trước khi xây editor.

**Acceptance criteria:**
- [ ] Chụp đúng màn hình chứa con trỏ và đúng kích thước pixel gốc.
- [ ] Không chứa cửa sổ app; chống gọi chồng và giải phóng lock khi lỗi.
- [ ] Đo thumbnail thực tế; nếu thiếu độ phân giải thử desktop frame capture rồi ghi quyết định backend.

**Verification:**
- [ ] pnpm test -- tests/capture.test.ts; pnpm build.
- [ ] Manual check: Chụp lưới/chữ nhỏ trên desktop ở 100%/150% và 4K nếu có; so kích thước và độ nét.

**Dependencies:** 02.

**Files likely touched:**
- `electron/capture.ts`
- `electron/main.ts`
- `electron/preload.cts`
- `src/App.tsx`
- `tests/capture.test.ts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Checkpoint sau Task 03

- [ ] Typecheck/build và các test liên quan đều đạt.
- [ ] Luồng mới chạy đúng trên desktop Windows thật; ghi kết quả và giới hạn môi trường.
- [ ] Đối chiếu yêu cầu người dùng, báo kết quả để review; chỉ thay đổi phạm vi sau khi thống nhất.

## Task 04: Chụp vùng kéo thả

- [ ] Hoàn thành Task 04.

**Description:** Tạo overlay ảnh đóng băng và crop theo hệ tọa độ ảnh.

**Acceptance criteria:**
- [ ] Kéo 4 hướng, clamp vùng chọn trong màn hình; không chấp nhận vùng rỗng.
- [ ] Crop đúng với origin âm và scale 100/125/150/200%; không chứa dim/viền.
- [ ] Escape đóng overlay; display thay đổi giữa phiên hủy sạch và báo lỗi.

**Verification:**
- [ ] pnpm test -- tests/geometry.test.ts; pnpm build.
- [ ] Manual check: Thử màn hình phụ bên trái, DPI hỗn hợp, kéo sát cạnh và hủy.

**Dependencies:** 03.

**Files likely touched:**
- `electron/overlay.ts`
- `src/capture/SelectionOverlay.tsx`
- `src/capture/geometry.ts`
- `electron/capture.ts`
- `tests/geometry.test.ts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Task 05: Gán phím tắt toàn cục

- [ ] Hoàn thành Task 05.

**Description:** Settings cho hai shortcut và lưu cấu hình bền vững.

**Acceptance criteria:**
- [ ] Hai shortcut gọi đúng full/region capture khi app không focus.
- [ ] Từ chối tổ hợp không hợp lệ/trùng; register thất bại rollback đăng ký và cấu hình cũ.
- [ ] Restart khôi phục phím; file cấu hình lỗi có fallback và phản hồi nếu default bị chiếm.

**Verification:**
- [ ] pnpm test -- tests/shortcuts.test.ts; pnpm build.
- [ ] Manual check: Thử khi Paint có focus, conflict thật, đổi phím và restart.

**Dependencies:** 04.

**Files likely touched:**
- `electron/shortcuts.ts`
- `electron/settings.ts`
- `src/settings/ShortcutSettings.tsx`
- `electron/main.ts`
- `tests/shortcuts.test.ts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Task 06: Tray và vòng đời phiên

- [ ] Hoàn thành Task 06.

**Description:** Thêm chạy nền, single-instance, Cancel/close/quit và trạng thái phiên.

**Acceptance criteria:**
- [ ] Tray có hai chế độ chụp, Settings, Quit; đóng Settings không ngắt shortcut.
- [ ] Một phiên tại một thời điểm; hotkey trong editor focus ảnh hiện tại, Cancel về tray.
- [ ] Quit unregister shortcut; cleanup bitmap/listener/stream; mở instance thứ hai focus instance cũ.

**Verification:**
- [ ] pnpm test -- tests/session.test.ts; pnpm build.
- [ ] Manual check: Double launch, spam hotkey, cancel/chụp lại, quit/relaunch; dùng icon tạm hợp lệ.

**Dependencies:** 05.

**Files likely touched:**
- `electron/lifecycle.ts`
- `electron/tray.ts`
- `electron/session.ts`
- `electron/main.ts`
- `tests/session.test.ts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Checkpoint sau Task 06

- [ ] Typecheck/build và các test liên quan đều đạt.
- [ ] Luồng mới chạy đúng trên desktop Windows thật; ghi kết quả và giới hạn môi trường.
- [ ] Đối chiếu yêu cầu người dùng, báo kết quả để review; chỉ thay đổi phạm vi sau khi thống nhất.

## Task 07: Editor và mô hình annotation

- [ ] Hoàn thành Task 07.

**Description:** Canvas hiển thị ảnh cùng toolbar và store có kiểu.

**Acceptance criteria:**
- [ ] Ảnh fit giữ tỷ lệ; resize không làm lệch tọa độ pixel gốc.
- [ ] Store chứa tool/style/selectedId và annotation union; ánh xạ pointer chính xác.
- [ ] Toolbar ngoài ảnh có label/active state; Cancel xóa dữ liệu phiên, ảnh mới sạch.

**Verification:**
- [ ] pnpm test -- tests/editor-coordinates.test.ts; pnpm build.
- [ ] Manual check: Thử ảnh toàn màn hình, vùng rất nhỏ, 4K và resize cửa sổ.

**Dependencies:** 03, 04, 06.

**Files likely touched:**
- `src/editor/Editor.tsx`
- `src/editor/store.ts`
- `src/editor/model.ts`
- `src/editor/render.ts`
- `tests/editor-coordinates.test.ts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Task 08: Mũi tên và màu nét

- [ ] Hoàn thành Task 08.

**Description:** Thêm kéo thả mũi tên, ô màu và độ dày.

**Acceptance criteria:**
- [ ] Đầu mũi tên đúng hướng; preview khớp nét commit.
- [ ] Style lưu cùng đối tượng, mặc định mới không đổi đối tượng cũ khi chưa chọn.
- [ ] Escape bỏ nét đang kéo; click không tạo mũi tên rỗng.

**Verification:**
- [ ] pnpm test -- tests/arrow.test.ts; pnpm build.
- [ ] Manual check: Vẽ 8 hướng, đổi màu/độ dày và hủy giữa nét.

**Dependencies:** 07.

**Files likely touched:**
- `src/editor/Toolbar.tsx`
- `src/editor/tools/arrow.ts`
- `src/editor/Editor.tsx`
- `src/editor/render.ts`
- `tests/arrow.test.ts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Task 09: Hình chữ nhật/vuông và tròn

- [ ] Hoàn thành Task 09.

**Description:** Bổ sung hai tool hình học dùng pipeline nét hiện tại.

**Acceptance criteria:**
- [ ] Chữ nhật kéo mọi hướng; Shift khóa vuông 1:1.
- [ ] Tool tròn luôn giữ tỷ lệ 1:1 và dùng màu/độ dày chọn.
- [ ] Preview và commit khớp ở mọi tỷ lệ hiển thị; không thêm hình rỗng.

**Verification:**
- [ ] pnpm test -- tests/shapes.test.ts; pnpm build.
- [ ] Manual check: Vẽ từ bốn góc; giữ/thả Shift và sát mép ảnh.

**Dependencies:** 08.

**Files likely touched:**
- `src/editor/tools/shapes.ts`
- `src/editor/Toolbar.tsx`
- `src/editor/Editor.tsx`
- `src/editor/render.ts`
- `tests/shapes.test.ts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Checkpoint sau Task 09

- [ ] Typecheck/build và các test liên quan đều đạt.
- [ ] Luồng mới chạy đúng trên desktop Windows thật; ghi kết quả và giới hạn môi trường.
- [ ] Đối chiếu yêu cầu người dùng, báo kết quả để review; chỉ thay đổi phạm vi sau khi thống nhất.

## Task 10: Bút tự do

- [ ] Hoàn thành Task 10.

**Description:** Vẽ chuỗi điểm theo pointer với màu/kích thước bút.

**Acceptance criteria:**
- [ ] Mỗi pointer down/up tạo một stroke riêng và liên tục.
- [ ] Pointer capture xử lý kéo ra ngoài/nhanh; tọa độ clamp, không kẹt drawing.
- [ ] Escape hủy nét chưa commit; nét đã commit giữ đúng style.

**Verification:**
- [ ] pnpm test -- tests/freehand.test.ts; pnpm build.
- [ ] Manual check: Vẽ nhanh/chậm, nhiều nét chồng và kéo ra khỏi canvas.

**Dependencies:** 09.

**Files likely touched:**
- `src/editor/tools/freehand.ts`
- `src/editor/Editor.tsx`
- `src/editor/Toolbar.tsx`
- `src/editor/render.ts`
- `tests/freehand.test.ts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Task 11: Chọn, đổi màu và xóa

- [ ] Hoàn thành Task 11.

**Description:** Hit-test annotation và thao tác trên đối tượng được chọn.

**Acceptance criteria:**
- [ ] Chọn đối tượng trên cùng, gồm freehand; click nền bỏ chọn.
- [ ] Ô màu cập nhật đối tượng chọn; Xóa/Delete chỉ xóa đối tượng đó.
- [ ] Xóa disabled khi không chọn; Delete trong input không ảnh hưởng editor; viền chọn không nằm trong ảnh xuất.

**Verification:**
- [ ] pnpm test -- tests/hit-test.test.ts; pnpm build.
- [ ] Manual check: Chọn hình/nét chồng nhau, đổi màu rồi xóa từng loại.

**Dependencies:** 10.

**Files likely touched:**
- `src/editor/hit-test.ts`
- `src/editor/store.ts`
- `src/editor/Editor.tsx`
- `src/editor/Toolbar.tsx`
- `tests/hit-test.test.ts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Task 12: Blur pen

- [ ] Hoàn thành Task 12.

**Description:** Tạo mask đường bút trên ảnh gốc đã blur, hỗ trợ chọn/xóa.

**Acceptance criteria:**
- [ ] Chỉ pixel trong mask bị blur; nét chồng không có khe hoặc tăng blur theo số lần vẽ.
- [ ] Xóa blur phục hồi nền; blur không dùng màu, annotation màu nằm phía trên.
- [ ] Cache blur dùng chung preview/export; đo p95 frame, mục tiêu dưới 33 ms trên ảnh 4K với cấu hình máy được ghi lại.

**Verification:**
- [ ] pnpm test -- tests/blur.test.ts; pnpm build.
- [ ] Manual check: Kiểm tra fixture pixel trong/ngoài mask, nét chồng, brush size và độ trễ trên Electron thật.

**Dependencies:** 11.

**Files likely touched:**
- `src/editor/tools/blur.ts`
- `src/editor/render.ts`
- `src/editor/hit-test.ts`
- `src/editor/Toolbar.tsx`
- `tests/blur.test.ts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Checkpoint sau Task 12

- [ ] Typecheck/build và các test liên quan đều đạt.
- [ ] Luồng mới chạy đúng trên desktop Windows thật; ghi kết quả và giới hạn môi trường.
- [ ] Đối chiếu yêu cầu người dùng, báo kết quả để review; chỉ thay đổi phạm vi sau khi thống nhất.

## Task 13: Copy ảnh

- [ ] Hoàn thành Task 13.

**Description:** Flatten ảnh gốc/annotation sang PNG và ghi clipboard ở main.

**Acceptance criteria:**
- [ ] PNG đúng kích thước pixel, gồm blur và mọi nét, không gồm UI/selection.
- [ ] Paste vào Paint khớp preview về hình, vị trí và màu.
- [ ] IPC kiểm tra session/payload; khóa copy trùng khi bận, lỗi giữ ảnh và cho thử lại.

**Verification:**
- [ ] pnpm test -- tests/export.test.ts; pnpm build.
- [ ] Manual check: Copy/paste Paint với ảnh trống và đủ mọi công cụ, đối chiếu fixture.

**Dependencies:** 12.

**Files likely touched:**
- `src/editor/export.ts`
- `electron/image-output.ts`
- `electron/preload.cts`
- `src/editor/Toolbar.tsx`
- `tests/export.test.ts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Task 14: Save PNG

- [ ] Hoàn thành Task 14.

**Description:** Mở dialog Windows chọn folder/tên, ghi PNG đã flatten.

**Acceptance criteria:**
- [ ] Mỗi lần Save cho chọn thư mục/tên .png, nhớ folder lần thành công.
- [ ] Cancel dialog giữ ảnh; lỗi quyền ghi/folder mất được báo và có thể thử lại.
- [ ] Ghi đè cần xác nhận; chỉ báo thành công sau ghi xong; tên mặc định có timestamp.

**Verification:**
- [ ] pnpm test -- tests/save.test.ts; pnpm build.
- [ ] Manual check: Thử Unicode path, folder khác, cancel, overwrite/lỗi ghi và mở PNG bằng Paint.

**Dependencies:** 13.

**Files likely touched:**
- `electron/image-output.ts`
- `electron/settings.ts`
- `src/editor/Toolbar.tsx`
- `electron/preload.cts`
- `tests/save.test.ts`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Task 15: Đóng gói và nghiệm thu

- [ ] Hoàn thành Task 15.

**Description:** Build installer Windows x64 và kiểm thử bản cài.

**Acceptance criteria:**
- [ ] Installer chạy không cần dev server; asset/preload/tray đầy đủ.
- [ ] Hai chế độ chụp, tất cả toolbar, Copy/Save/Cancel và settings qua restart đạt trên bản cài.
- [ ] Ghi matrix DPI/multi-display/4K và 30 phiên kiểm tra bộ nhớ; nêu rõ trường hợp chưa kiểm chứng.

**Verification:**
- [ ] pnpm typecheck; pnpm test; pnpm build; pnpm test:e2e; pnpm dist.
- [ ] Manual check: Cài installer, chạy toàn bộ flow Windows; bản local chưa ký, phát hành công khai là phạm vi riêng.

**Dependencies:** 01–14.

**Files likely touched:**
- `electron-builder.yml`
- `package.json`
- `assets/icon.ico`
- `tests/e2e/screenshot.spec.ts`
- `docs/windows-qa.md`

**Estimated scope:** M, 3–5 file nguồn/cấu hình; generated UI và lockfile được kiểm tra cùng task.

## Checkpoint sau Task 15

- [ ] Typecheck/build và các test liên quan đều đạt.
- [ ] Luồng mới chạy đúng trên desktop Windows thật; ghi kết quả và giới hạn môi trường.
- [ ] Đối chiếu yêu cầu người dùng, báo kết quả để review; chỉ thay đổi phạm vi sau khi thống nhất.
- [ ] Đủ toàn bộ acceptance, installer và tài liệu QA sẵn sàng bàn giao.



## Giai đoạn bổ sung: Text, Emoji và đa màn hình

Yêu cầu ngày 2026-09-09. Các task bên dưới đã triển khai code và kiểm thử tự động; status: needs review do còn nghiệm thu thủ công. Installer 0.2.0 và evidence nằm trong docs/windows-qa.md. Các checkbox acceptance chưa được nghiệm thu đầy đủ vẫn giữ mở. Task 01–15 có baseline đã triển khai; checkbox lịch sử được giữ nguyên vì còn nghiệm thu thủ công, xem docs/windows-qa.md.

## Task 16: Resolve màn hình đích và hợp đồng capture

- [x] Triển khai code Task 16.

**Status: needs review.** Đã có implementation và regression tự động; xem kết quả/giới hạn tại docs/windows-qa.md, mục 0.2.0. Các tiêu chí thủ công bên dưới cần nghiệm thu trước khi đánh dấu toàn bộ task done.

**Description:** Tái hiện lỗi hotkey riêng với lỗi chọn màn hình từ nút; bổ sung CaptureRequest có cursor/display target và danh sách display được main xác thực.

**Acceptance criteria:**
- [ ] App ở A, hotkey với con trỏ ở B chốt B ngay trong callback; không dùng vị trí cửa sổ/focus thay cursor.
- [ ] Explicit displayId chỉ được nhận khi còn kết nối; không dùng source đầu tiên hoặc fallback âm thầm sang A.
- [ ] Sender/payload kiểm tra đủ; topology change hủy sạch; lock editor vẫn giữ ảnh hiện tại.
- [ ] Metadata trace phục vụ debug không chứa ảnh; bỏ hoặc giới hạn diagnostic khi hoàn tất.

**Verification:**
- [ ] `pnpm test -- tests/display-target.test.ts`; `pnpm typecheck`; `pnpm build`.
- [ ] Desktop thật: ghi display/source ID cho hotkey ở từng màn và xác nhận crop/source đúng.

**Dependencies:** Baseline Task 03–06.
**Files likely touched:** `shared/contracts.ts`, `electron/preload.cts`, `electron/main.ts`, `electron/display-target.ts`, `tests/display-target.test.ts`.
**Estimated scope:** M, khoảng 5 file.

## Task 17: Chọn màn hình từ Settings và tray

- [x] Triển khai code Task 17.

**Status: needs review.** Đã có implementation và regression tự động; xem kết quả/giới hạn tại docs/windows-qa.md, mục 0.2.0. Các tiêu chí thủ công bên dưới cần nghiệm thu trước khi đánh dấu toàn bộ task done.

**Description:** Thêm selector display trong Settings và submenu capture theo từng display trong tray, dùng target đã chốt ở Task 16.

**Acceptance criteria:**
- [ ] Khi app ở A, chọn B rồi bấm Full screen hoặc Select region sẽ chụp B.
- [ ] Tray có hai hành động cho mỗi display; mở menu trên A không làm mất target B.
- [ ] Hiển thị nhãn/resolution/vị trí, refresh khi cắm/rút; lựa chọn mất kết nối được báo và không tự chụp màn khác.
- [ ] Giải thích hotkey theo con trỏ, nút theo display đã chọn; overlay phủ đúng bounds màn B, kể cả tọa độ âm.

**Verification:**
- [ ] `pnpm typecheck`; `pnpm build`; Electron E2E cho explicit target.
- [ ] Desktop thật: app ở A chụp B rồi đảo A/B, full/region/tray, DPI hỗn hợp và sát mép.

**Dependencies:** 16.
**Files likely touched:** `src/settings/ShortcutSettings.tsx`, `electron/main.ts`, `src/capture/SelectionOverlay.tsx`, `tests/e2e/displays.spec.ts`, `docs/windows-qa.md`.
**Estimated scope:** M, khoảng 5 file.

## Checkpoint sau Task 17
- [ ] Typecheck/build và resolver tests đạt.
- [ ] Ghi rõ nút/tray đã sửa và hotkey đã tái hiện/kiểm chứng trên từng display; không dùng inventory màn hình thay nghiệm thu capture.
- [ ] Review hành vi mới với người dùng; giữ các giới hạn phần cứng chưa kiểm chứng.

## Task 18: Model, layout và render Text

- [x] Triển khai code Task 18.

**Status: needs review.** Đã có implementation và regression tự động; xem kết quả/giới hạn tại docs/windows-qa.md, mục 0.2.0. Các tiêu chí thủ công bên dưới cần nghiệm thu trước khi đánh dấu toàn bộ task done.

**Description:** Thêm text annotation và một layout theo pixel gốc dùng chung render, hit-test và dirty bounds.

**Acceptance criteria:**
- [ ] Có content nhiều dòng, font/size/lineHeight/color/position; không cần brush width.
- [ ] Đo glyph và bounds đúng baseline; clip ở biên ảnh; sửa nội dung/size xóa được toàn bộ vùng cũ.
- [ ] Preview/export cùng font và layout, text ở trên blur; selection không xuất vào ảnh.

**Verification:**
- [ ] `pnpm test -- tests/text-layout.test.ts`; `pnpm typecheck`; `pnpm build`.
- [ ] Fixture Electron kiểm tra tiếng Việt, nhiều dòng, độ zoom, bounds cũ/mới và PNG.

**Dependencies:** Baseline Task 07–14; thực hiện sau checkpoint 17.
**Files likely touched:** `src/editor/model.ts`, `src/editor/text-layout.ts`, `src/editor/render.ts`, `src/editor/hit-test.ts`, `tests/text-layout.test.ts`.
**Estimated scope:** M, khoảng 5 file.

## Task 19: Button Text và composer chỉnh sửa

- [x] Triển khai code Task 19.

**Status: needs review.** Đã có implementation và regression tự động; xem kết quả/giới hạn tại docs/windows-qa.md, mục 0.2.0. Các tiêu chí thủ công bên dưới cần nghiệm thu trước khi đánh dấu toàn bộ task done.

**Description:** Cho đặt text bằng click, nhập/sửa bằng composer, đổi màu/cỡ chữ và xóa qua selection.

**Acceptance criteria:**
- [ ] Text button có active state/label; Xong hoặc Ctrl+Enter commit, Enter xuống dòng; không tạo text trắng/rỗng.
- [ ] Escape hủy draft trước; double-click Select để sửa, hủy sửa giữ bản cũ; IME không commit nhầm.
- [ ] Giới hạn 2.000 ký tự/20 dòng; size 12–160 pixel; báo lỗi rõ. Copy/Save/đổi tool khóa khi composer mở.
- [ ] Delete trong input không xóa annotation; chọn text đổi màu/size đúng đối tượng.

**Verification:**
- [ ] `pnpm typecheck`; `pnpm build`; focused Electron Text interaction test.
- [ ] Nhập tiếng Việt, sửa/hủy text cũ, resize editor và xác nhận composer không xuất vào PNG.

**Dependencies:** 18.
**Files likely touched:** `src/editor/TextComposer.tsx`, `src/editor/Toolbar.tsx`, `src/editor/Editor.tsx`, `src/stores/editor.ts`, `tests/e2e/text.spec.ts`.
**Estimated scope:** M, khoảng 5 file.

## Checkpoint sau Task 19
- [ ] Text tạo/sửa/chọn/xóa và export đạt; giữ nguyên các tool cũ.
- [ ] Font/dirty bounds/IME được kiểm chứng bằng Electron thật; build/typecheck sạch.

## Task 20: Model và spike render Emoji màu

- [x] Triển khai code Task 20.

**Status: needs review.** Đã có implementation và regression tự động; xem kết quả/giới hạn tại docs/windows-qa.md, mục 0.2.0. Các tiêu chí thủ công bên dưới cần nghiệm thu trước khi đánh dấu toàn bộ task done.

**Description:** Thêm emoji annotation và kiểm chứng font Segoe UI Emoji với tập emoji offline trước khi xây picker.

**Acceptance criteria:**
- [ ] Giữ nguyên chuỗi Unicode/grapheme gồm variation selector và ZWJ; size/position riêng, không có recolor.
- [ ] Font sẵn sàng trước đo/vẽ/export; glyph màu preview và PNG khớp, không xuất ô vuông.
- [ ] Bounds/hit-test/dirty render hỗ trợ emoji; emoji ở trên blur, xóa phục hồi nền.
- [ ] Chốt tập khoảng 32 emoji đã kiểm chứng; nếu font native không đạt, ghi đề xuất asset offline/license trước khi thêm dependency.

**Verification:**
- [ ] `pnpm typecheck`; `pnpm build`; `pnpm exec playwright test tests/e2e/emoji-render.spec.ts`.
- [ ] Kiểm tra Windows/font thực tế, emoji màu, chuỗi kết hợp, clip cạnh và export gốc.

**Dependencies:** 18–19.
**Files likely touched:** `src/editor/model.ts`, `src/editor/render.ts`, `src/editor/hit-test.ts`, `src/editor/emoji-layout.ts`, `tests/e2e/emoji-render.spec.ts`.
**Estimated scope:** M, khoảng 5 file.

## Task 21: Button Emoji và picker offline

- [x] Triển khai code Task 21.

**Status: needs review.** Đã có implementation và regression tự động; xem kết quả/giới hạn tại docs/windows-qa.md, mục 0.2.0. Các tiêu chí thủ công bên dưới cần nghiệm thu trước khi đánh dấu toàn bộ task done.

**Description:** Thêm picker accessible, chọn emoji rồi click ảnh để đặt; hỗ trợ chọn/đổi size/xóa.

**Acceptance criteria:**
- [ ] Button Emoji mở picker có tên từng mục và điều hướng bàn phím; không gọi mạng.
- [ ] Đặt vào ảnh ở pixel gốc, size mặc định 48, giới hạn 16–256; ô màu không tint emoji.
- [ ] Escape đóng picker/hủy placement trước khi hủy capture; focus và Delete đúng ngữ cảnh.
- [ ] Chọn/xóa/size đổi đúng đối tượng; picker không xuất vào PNG; không thay đổi hành vi Text.

**Verification:**
- [ ] `pnpm typecheck`; `pnpm build`; focused Electron Emoji interaction test.
- [ ] Đặt nhiều emoji, thay size, chọn/xóa với text/hình/blur chồng nhau và Copy/Save.

**Dependencies:** 20.
**Files likely touched:** `src/editor/EmojiPicker.tsx`, `src/editor/Toolbar.tsx`, `src/editor/Editor.tsx`, `src/stores/editor.ts`, `tests/e2e/emoji.spec.ts`.
**Estimated scope:** M, khoảng 5 file.

## Checkpoint sau Task 21
- [ ] Text và Emoji cùng tồn tại với mọi annotation cũ; không regression Copy/Save/Cancel.
- [ ] Pixel export/glyph/dirty region và quản lý focus đạt; giới hạn OS/font được ghi rõ.

## Task 22: Regression, đóng gói và cập nhật QA

- [x] Triển khai code Task 22.

**Status: needs review.** Đã có implementation và regression tự động; xem kết quả/giới hạn tại docs/windows-qa.md, mục 0.2.0. Các tiêu chí thủ công bên dưới cần nghiệm thu trước khi đánh dấu toàn bộ task done.

**Description:** Nghiệm thu ba yêu cầu mới trên bản đóng gói, đo lại 4K và ghi evidence/giới hạn.

**Acceptance criteria:**
- [ ] Bản packaged chụp được màn B khi app ở A bằng selector/tray và hotkey theo cursor; thực hiện đảo chiều.
- [ ] Text/Emoji preview và PNG/clipboard khớp, selection UI không xuất; cache không để lại glyph sau sửa/xóa.
- [ ] Không regression blur 4K, cleanup nhiều phiên, topology cancellation, shortcut conflict/restart.
- [ ] Installer mới có asset/font cần thiết, không cần dev server; docs và implementation log ghi kết quả thật, không đánh dấu DPI vật lý chưa thử là đạt.

**Verification:**
- [ ] `pnpm typecheck`; `pnpm test`; `pnpm build`; `pnpm test:e2e`; `pnpm dist`.
- [ ] Chạy smoke trên executable đóng gói; native hotkey/display/Save/Paint và matrix 100/125/150/200% nếu có phần cứng.

**Dependencies:** 16–21.
**Files likely touched:** `tests/e2e/screenshot.spec.ts`, `tests/e2e/render.spec.ts`, `docs/windows-qa.md`, `README.md`, `.agents/implements/implement-notes.html`.
**Estimated scope:** M, khoảng 5 file, ngoài artifact sinh tự động.

## Checkpoint sau Task 22
- [ ] Phạm vi Text + Emoji + sửa chọn display được đối chiếu đủ.
- [ ] Các kiểm tra tự động và nghiệm thu desktop có evidence; phần chưa kiểm chứng được liệt kê.
- [ ] Installer và tài liệu sẵn sàng review.

Thứ tự thực hiện: 16 → 17 → 18 → 19 → 20 → 21 → 22. Không thay đổi checkbox lịch sử Task 01–15 trong lần cập nhật kế hoạch này.


## Giai đoạn bổ sung: Di chuyển và resize bằng 8 handle

Status: needs review. Task 23–27 đã triển khai code và regression tự động; phạm vi và quy ước chi tiết trong task.md. Không thay đổi checkbox lịch sử Task 01–22.

## Task 23: Geometry transform và bounds dùng chung

- [x] Triển khai code Task 23.

**Status: needs review.** Implementation và regression tự động đạt; xem docs/windows-qa.md mục 0.3.0. Các tiêu chí manual/hardware chưa nghiệm thu đầy đủ tiếp tục để mở.

**Description:** Thêm pure geometry cho translation/resize từ snapshot, 8 anchors và inverse hit-test; model drawing nhận transform identity mặc định.
**Acceptance criteria:**
- [ ] Tám handle có neo đúng; clamp dương, aspect lock, không drift hoặc chia 0 với đường ngang/dọc và một điểm.
- [ ] Bounds geometry khác padding UI; transform/hit-test dùng tọa độ pixel ảnh, hợp lệ ở zoom và vùng clip.
- [ ] Annotation cũ giữ render identity; contract cho drawing affine và glyph uniform rõ ràng.
**Verification:**
- [ ] pnpm test -- tests/transform.test.ts; pnpm typecheck; pnpm build.
- [ ] Fixture nhỏ xác nhận từng anchor và round-trip inverse với scale không đều.
**Dependencies:** Baseline 18–22 đã có code; giới hạn manual lịch sử tiếp tục được ghi nhận.
**Files likely touched:** src/editor/model.ts, src/editor/transform.ts, src/editor/hit-test.ts, src/editor/render.ts, tests/transform.test.ts.
**Estimated scope:** M, khoảng 5 file.

## Task 24: Khung chọn và kéo di chuyển

- [x] Triển khai code Task 24.

**Status: needs review.** Implementation và regression tự động đạt; xem docs/windows-qa.md mục 0.3.0. Các tiêu chí manual/hardware chưa nghiệm thu đầy đủ tiếp tục để mở.

**Description:** Thêm overlay 8 handles và drag move theo snapshot, pointer capture, trạng thái preview/commit/cancel.
**Acceptance criteria:**
- [ ] Khung/handles giữ kích thước CSS khi zoom; chọn và kéo tất cả annotation không nhảy vị trí, hit priority đúng.
- [ ] Pointer-up commit; Escape/cancel/lost capture/resize cửa sổ phục hồi snapshot; khóa thao tác xung đột và giữ double-click text.
- [ ] Move glyph/drawing/blur đúng pixel; bounds cũ được xóa, handles không xuất và ảnh nền không dịch chuyển.
**Verification:**
- [ ] pnpm exec playwright test tests/e2e/transform.spec.ts --grep move; pnpm typecheck; pnpm build.
- [ ] Manual kéo ra ngoài canvas, đổi zoom qua resize cửa sổ, kiểm tra focus và vùng clip.
**Dependencies:** 23.
**Files likely touched:** src/editor/SelectionHandles.tsx, src/editor/Editor.tsx, src/editor/render.ts, src/styles.css, tests/e2e/transform.spec.ts.
**Estimated scope:** M, khoảng 5 file.

## Checkpoint sau Task 24
- [ ] Geometry và move đạt, preview/cancel/export không sót pixel.
- [ ] Không regression nhập Text, picker Emoji và các tool vẽ cũ; ghi rõ khác biệt nếu có trước khi tiếp tục.

## Task 25: Resize hình, nét và mask blur

- [x] Triển khai code Task 25.

**Status: needs review.** Implementation và regression tự động đạt; xem docs/windows-qa.md mục 0.3.0. Các tiêu chí manual/hardware chưa nghiệm thu đầy đủ tiếp tục để mở.

**Description:** Nối 8 handles với transform resize cho drawing; scale geometry/stroke thống nhất, blur chỉ scale mask tại vị trí mới.
**Acceptance criteria:**
- [ ] Góc/cạnh giữ neo đúng; Shift ở góc khóa tỷ lệ, kích thước tối thiểu và không flip; circle kéo không đều thành ellipse.
- [ ] Render/bounds/hit-test cùng transform, bao gồm arrowhead và nét dày; selection/delete vẫn đúng sau resize.
- [ ] Blur dùng nền mới dưới mask, xóa/hủy trả nền cũ; overlap/layer order và fresh export khớp preview.
**Verification:**
- [ ] pnpm test -- tests/transform.test.ts; pnpm exec playwright test tests/e2e/transform.spec.ts --grep resize; pnpm typecheck; pnpm build.
- [ ] Fixture nền khác nhau hai vị trí để kiểm tra mask blur, đủ 8 handles và đường suy biến.
**Dependencies:** 23–24.
**Files likely touched:** src/editor/transform.ts, src/editor/render.ts, src/editor/Editor.tsx, tests/transform.test.ts, tests/e2e/transform.spec.ts.
**Estimated scope:** M, khoảng 5 file.

## Task 26: Resize Text và Emoji giữ tỷ lệ

- [x] Triển khai code Task 26.

**Status: needs review.** Implementation và regression tự động đạt; xem docs/windows-qa.md mục 0.3.0. Các tiêu chí manual/hardware chưa nghiệm thu đầy đủ tiếp tục để mở.

**Description:** Áp dụng drag uniform resize cho glyph, tính lại font bounds và neo, đồng bộ kích thước với slider/composer.
**Acceptance criteria:**
- [ ] Cả 8 handles resize uniform theo neo đã quy định; Text 12–160/Emoji 16–256, nội dung/line breaks/Unicode giữ nguyên.
- [ ] Double-click sửa sau transform, đổi size/color hợp lệ, chọn/xóa đúng; xử lý chữ clip và cỡ tối thiểu không nhảy vị trí.
- [ ] Live preview, cancel và export dùng cùng glyph layout; không méo/rasterize chữ, không sót glyph ở vị trí cũ.
**Verification:**
- [ ] pnpm test -- tests/text-layout.test.ts; pnpm exec playwright test tests/e2e/transform.spec.ts --grep glyph; pnpm typecheck; pnpm build.
- [ ] Tiếng Việt nhiều dòng và Emoji ZWJ ở zoom nhỏ, min/max size, cạnh ảnh; slider sau drag phản ánh size hiệu dụng.
**Dependencies:** 24–25.
**Files likely touched:** src/editor/transform.ts, src/editor/glyph-layout.ts, src/editor/Editor.tsx, src/stores/editor.ts, tests/e2e/transform.spec.ts.
**Estimated scope:** M, khoảng 5 file.

## Checkpoint sau Task 26
- [ ] Mọi loại annotation di chuyển/resize được; đủ 8 handles, cancel và export đạt.
- [ ] Text/Emoji không méo, blur không kéo nhầm bitmap; giới hạn/manual chưa thử được ghi rõ.

## Task 27: Regression, installer và tài liệu transform

- [x] Triển khai code Task 27.

**Status: needs review.** Implementation và regression tự động đạt; xem docs/windows-qa.md mục 0.3.0. Các tiêu chí manual/hardware chưa nghiệm thu đầy đủ tiếp tục để mở.

**Description:** Đo lại 4K, chạy đầy đủ regression và smoke bản đóng gói, cập nhật hướng dẫn/trạng thái thực tế.
**Acceptance criteria:**
- [ ] Pixel preview/fresh export/clipboard khớp sau move/resize/cancel/delete; handles không đi vào ảnh; 4K không vượt ngưỡng regression hiện có.
- [ ] Hai màn hình, native hotkey, Copy/Save và cleanup vẫn đạt trên executable đóng gói; kiểm tra 8 handles và tất cả loại annotation.
- [ ] Installer local mới và hướng dẫn sử dụng sẵn sàng; plan/log ghi done hoặc needs review theo evidence, giữ phần cứng chưa thử ở trạng thái mở.
**Verification:**
- [ ] pnpm typecheck; pnpm test; pnpm build; pnpm exec playwright test; pnpm exec electron-builder --win nsis --x64 --publish never.
- [ ] Smoke SCREENSHOT_EXECUTABLE với transform.spec.ts và regression; manual DPI/mixed DPI, native IME/Save và installer wizard khi môi trường cho phép.
**Dependencies:** 23–26.
**Files likely touched:** tests/e2e/render.spec.ts, tests/e2e/transform.spec.ts, README.md, docs/windows-qa.md, .agents/implements/implement-notes.html; version/plan metadata cập nhật khi bàn giao.
**Estimated scope:** M, khoảng 5 file chính, ngoài artifact sinh tự động.

## Checkpoint sau Task 27
- [ ] Đối chiếu yêu cầu giữ chuột kéo vị trí và 4 góc/4 cạnh đổi size.
- [ ] Tests/build/packaged smoke có evidence và phần chưa kiểm chứng được liệt kê.
- [ ] Installer và tài liệu sẵn sàng review; không tự publish.

Thứ tự: 23 → 24 → 25 → 26 → 27. Các task mới đã triển khai trong 0.3.0. Không đánh dấu nghiệm thu thủ công/phần cứng chưa thử là done.


## Giai đoạn bổ sung: Xoay 360° và viền rectangle đều (2026-09-10)

**Status: needs review.** Task 28–33 đã triển khai; Task 28–30 done, Task 31–33 còn nghiệm thu thủ công/phần cứng; đặc tả và kết quả kiểm tra code ở phần bổ sung tương ứng trong task.md. Quy ước rectangle giữ nguyên stroke width thay thế scale cả stroke trước đây. Giữ nguyên checkbox Task 01–27.

## Task 28: Sửa độ dày viền rectangle khi resize

- [x] Triển khai code Task 28.
**Status: done**

**Description:** Scale geometry rectangle rồi stroke với width cố định; đồng bộ bounds/hit-test và bổ sung test đo viền độc lập.
**Acceptance criteria:**
- [x] Bốn cạnh cùng width khi kéo ngang/dọc/góc hoặc resize lặp lại; pixel test phát hiện lỗi trước sửa và đạt sau sửa.
- [x] Tám neo, Shift giữ tỷ lệ, min size và clamp vẫn đúng; chọn/xóa nét sau resize đúng dung sai.
- [x] Preview/export đồng nhất; circle, arrow, freehand và blur giữ hành vi cũ.
**Verification:**
- [x] pnpm.cmd test -- tests/transform.test.ts; pnpm.cmd typecheck; pnpm.cmd build.
- [x] pnpm.cmd exec playwright test tests/e2e/render.spec.ts tests/e2e/rotation-render.spec.ts; đo cạnh trên fixture phẳng, sai số khử răng cưa tối đa 1 px.
**Dependencies:** Code Task 23–27 hiện có.
**Files likely touched:** src/editor/transform.ts, src/editor/render.ts, src/editor/hit-test.ts, tests/transform.test.ts, tests/e2e/render.spec.ts.
**Estimated scope:** M, 5 file.

## Task 29: Geometry xoay và contract annotation

- [x] Triển khai code Task 29.
**Status: done**

**Description:** Thêm rotation mặc định 0, tâm/oriented bounds/world AABB và phép thuận/nghịch dùng chung cho bốn loại yêu cầu.
**Acceptance criteria:**
- [x] Annotation cũ giữ identity; thứ tự scale/translate/rotate và đơn vị radian được xác định, không thay đổi đối tượng gốc.
- [x] Góc 0/45/90/180/270/360°, inverse round-trip, tâm và bounds chứa đủ hình/glyph/stroke đạt.
- [x] Xoay hai chiều qua 0° liên tục, snap 15° đúng, con trỏ sát tâm không sinh NaN; arrow ngang/dọc có bounds hữu hạn.
**Verification:**
- [x] pnpm.cmd test -- tests/rotation.test.ts; pnpm.cmd typecheck; pnpm.cmd build.
**Dependencies:** 28.
**Files likely touched:** src/editor/model.ts, src/editor/transform.ts, src/editor/glyph-layout.ts, tests/rotation.test.ts.
**Estimated scope:** M, 4 file.

## Checkpoint sau Task 29
- [x] Test viền bắt đúng lỗi độc lập với so sánh export; geometry xoay có evidence và build sạch.
- [x] Các quy ước mới không làm sai bounds/neo resize đã có.

## Task 30: Render và chọn đối tượng đã xoay

- [x] Triển khai code Task 30.
**Status: done**

**Description:** Tích hợp rotation vào paint, inverse hit-test, bounds và dirty region trước khi nối thao tác chuột.
**Acceptance criteria:**
- [x] Arrow, rectangle, Text và Emoji xoay đúng quanh tâm; rectangle vẫn viền đều, glyph giữ nội dung/màu.
- [x] Chọn đúng nét/glyph sau xoay, dung sai đúng zoom; vùng ngoài oriented box không bị nhận nhầm chỉ vì nằm trong AABB.
- [x] Incremental preview bằng fresh export sau xoay/xóa/hủy; không sót pixel ở góc cũ, clipping đúng.
**Verification:**
- [x] pnpm.cmd test -- tests/rotation.test.ts; pnpm.cmd typecheck; pnpm.cmd build.
- [x] pnpm.cmd exec playwright test tests/e2e/render.spec.ts tests/e2e/rotation-render.spec.ts; fixture bốn loại ở góc vuông và 45°.
**Dependencies:** 29.
**Files likely touched:** src/editor/render.ts, src/editor/hit-test.ts, tests/rotation.test.ts, tests/e2e/render.spec.ts.
**Estimated scope:** M, 4 file.

## Task 31: Handle xoay và resize theo trục đã xoay

- [x] Triển khai code Task 31.
**Status: needs review — code và regression tự động đã hoàn tất; xem các mục manual còn mở và docs/windows-qa.md.**

**Description:** Nối oriented selection và rotate gesture; cập nhật move/resize theo local axes giữ neo world.
**Acceptance criteria:**
- [x] Bốn loại có handle xoay riêng, label/góc hiện tại, hit target ổn định theo CSS; kéo đủ vòng hai chiều và Shift snap 15°.
- [x] Tám handle resize sau xoay giữ neo đối diện, glyph uniform, min/max/clamp đúng; move/rotate/resize lặp lại không drift hoặc flip.
- [x] Pointer-up commit; Escape/cancel/lost capture/resize cửa sổ phục hồi snapshot; kéo ngoài canvas và khóa thao tác xung đột đúng.
**Verification:**
- [x] pnpm.cmd test -- tests/rotation.test.ts; pnpm.cmd typecheck; pnpm.cmd build.
- [ ] pnpm.cmd exec playwright test tests/e2e/rotation.spec.ts; manual các handle ở 0/45/90/270°, sát biên và zoom nhỏ.
**Dependencies:** 30.
**Files likely touched:** src/editor/SelectionHandles.tsx, src/editor/Editor.tsx, src/editor/transform.ts, src/styles.css, tests/e2e/rotation.spec.ts.
**Estimated scope:** M, 5 file chính; bổ sung ca geometry vào tests/rotation.test.ts nếu phát hiện edge case mới.

## Checkpoint sau Task 31
- [x] Xoay, resize và move đủ bốn loại hoạt động; pixel viền, cancel và dirty region đạt.
- [x] Không regression tám handles của circle/freehand/blur hoặc quy tắc layer/clip.

## Task 32: Sửa text và đổi size sau xoay

- [x] Triển khai code Task 32.
**Status: needs review — code và regression tự động đã hoàn tất; xem các mục manual còn mở và docs/windows-qa.md.**

**Description:** Giữ rotation và điểm đặt local khi composer/slider thay đổi glyph layout; xác nhận thao tác sau xoay.
**Acceptance criteria:**
- [ ] Double-click text đã xoay mở composer; commit/hủy giữ góc, không làm mất nội dung tiếng Việt nhiều dòng/IME.
- [x] Đổi màu, fontSize/emoji size sau xoay đồng bộ bounds/selection; giới hạn size và emoji ZWJ giữ nguyên.
- [x] Xóa/cancel không sót glyph; sửa layout không nhảy vị trí trong drag và giữ điểm đặt local khi commit.
**Verification:**
- [x] pnpm.cmd test -- tests/text-layout.test.ts; pnpm.cmd typecheck; pnpm.cmd build.
- [ ] pnpm.cmd exec playwright test tests/e2e/rotation.spec.ts; manual IME và slider min/max.
**Dependencies:** 31.
**Files likely touched:** src/editor/Editor.tsx, src/editor/TextComposer.tsx, src/stores/editor.ts, src/editor/glyph-layout.ts, tests/e2e/rotation.spec.ts.
**Estimated scope:** M, 5 file.

## Task 33: Regression và tài liệu nghiệm thu

- [x] Triển khai code Task 33.
**Status: needs review — code và regression tự động đã hoàn tất; xem các mục manual còn mở và docs/windows-qa.md.**

**Description:** Kiểm tra chuỗi thao tác hoàn chỉnh, ảnh xuất và hiệu năng; cập nhật hướng dẫn/QA theo evidence thực tế.
**Acceptance criteria:**
- [x] Typecheck, unit, build, Electron transform/render/rotation và regression hiện có đạt; 4K giữ ngưỡng kiểm thử hiện tại.
- [ ] Copy/PNG đúng hướng và viền đều, không chứa selection/handle; smoke executable mới đạt, native Save kiểm tra thủ công.
- [x] README/QA/log ghi cách xoay, Shift snap và stroke cố định; DPI/mixed DPI chưa thử vẫn để mở, không tự publish.
**Verification:**
- [x] pnpm.cmd typecheck; pnpm.cmd test; pnpm.cmd build; pnpm.cmd exec playwright test.
- [x] pnpm.cmd exec electron-builder --win nsis --x64 --publish never; smoke qua SCREENSHOT_EXECUTABLE.
- [ ] Manual 100/125/150/200% nếu có môi trường; ghi evidence và giới hạn, không coi mock là nghiệm thu phần cứng.
**Dependencies:** 28–32.
**Files likely touched:** tests/e2e/render.spec.ts, tests/e2e/rotation.spec.ts, README.md, docs/windows-qa.md, .agents/implements/implement-notes.html.
**Estimated scope:** M, 5 file chính; cập nhật checkbox plan khi bàn giao.

## Checkpoint sau Task 33
- [x] Đủ yêu cầu xoay 360° bốn loại và sửa viền không đều; kết quả test/packaged smoke được ghi lại.
- [x] Phần chưa nghiệm thu được nêu rõ; tài liệu và bản build sẵn sàng review.

Thứ tự thực hiện: 28 → 29 → 30 → 31 → 32 → 33. Đã triển khai theo yêu cầu “implement đi”. Typecheck/build, 89 unit tests và 14/14 desktop E2E cuối đạt; 11/11 tests trên executable đóng gói đạt. Kết quả desktop đầy đủ và các lần chạy lại ghi tại docs/windows-qa.md. Các checkbox còn mở chứa nghiệm thu manual/IME/native Save/DPI chưa thực hiện; không thay đổi Task 01–27.
