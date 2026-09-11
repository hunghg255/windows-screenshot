# Kế hoạch: Ứng dụng Windows Screenshot

Ngày lập/cập nhật: 2026-09-10. Baseline MVP đã triển khai và có installer; một số nghiệm thu thủ công còn mở. Bổ sung Text, Emoji và sửa chọn màn hình đã triển khai (Task 16–22). Status: needs review — build/typecheck, 48 unit tests, 8 desktop tests và 7 tests trên executable 0.2.0 đều đạt; nghiệm thu thủ công/phần cứng còn mở, xem docs/windows-qa.md.
Dự án đã có AGENTS.md, pnpm, build/test và implementation log. Kết quả baseline nằm tại docs/windows-qa.md và .agents/implements/implement-notes.html.
Bổ sung mới 2026-09-10: xoay 360° và sửa độ dày viền rectangle khi resize (Task 28–33), code complete; needs review cho nghiệm thu manual/hardware.
Task list duy nhất: [todo.md](todo.md), cùng thư mục .agents/plans/windows-screenshot/.

## Mục tiêu và phạm vi

Ứng dụng desktop Windows dùng Electron stable mới nhất, React 19, Vite 8, shadcn/ui, Tailwind CSS và Zustand. Người dùng gán hai phím tắt toàn cục: chụp toàn màn hình và kéo thả chọn vùng. Sau chụp, mở editor có ảnh và toolbar: đổi màu, mũi tên, vuông/chữ nhật, tròn, blur pen, bút tự do, xóa đối tượng, Copy, Save, Cancel.

## Phạm vi baseline và điều chỉnh bổ sung

- Windows 11 x64 là môi trường nghiệm thu ban đầu; Windows 10 và ARM64 cần xác nhận nếu muốn hỗ trợ.
- Toàn màn hình = toàn bộ một display, gồm taskbar; chưa ghép tất cả màn hình. Bổ sung: nút Settings/tray dùng display chọn rõ ràng, hotkey dùng display dưới con trỏ.
- Chọn vùng trên display đích đã chốt theo nguồn kích hoạt như trên; không kéo xuyên hai màn hình trong MVP.
- Phím mặc định đề xuất Ctrl+Alt+F (toàn màn hình), Ctrl+Alt+R (chọn vùng); người dùng đổi được, không ghi đè phím đã bị ứng dụng khác chiếm.
- Save mở hộp thoại Windows chọn thư mục và tên file mỗi lần; nhớ thư mục lần lưu thành công gần nhất. PNG giữ độ phân giải gốc.
- Copy/Save thành công giữ editor để tiếp tục thao tác; Cancel đóng phiên và bỏ ảnh chưa lưu. Escape hủy nét đang vẽ trước, nếu không có nét đang vẽ thì hủy phiên.
- Một phiên chụp/chỉnh sửa tại một thời điểm; phím chụp trong lúc đang chỉnh sửa đưa editor lên trước, không làm mất ảnh.
- App ở system tray khi đóng cửa sổ cài đặt; menu tray có chụp, cài đặt, thoát. Cancel trở về tray.
- Đổi màu áp dụng cho đối tượng đang chọn hoặc nét tiếp theo; blur không có màu. Chọn đối tượng bằng click, xóa đối tượng đã chọn bằng toolbar hoặc Delete.
- Vuông dùng Shift khi vẽ chữ nhật; công cụ tròn tạo hình tròn. Thêm điều chỉnh độ dày nét/kích thước blur để các bút sử dụng được.
- Không thuộc MVP: tài khoản, cloud/upload, quay video, OCR, lịch sử ảnh, tự cập nhật, tự khởi động Windows, undo/redo, di chuyển/resize đối tượng sau khi vẽ.

## Quyết định kiến trúc

### Công nghệ và build

- Electron stable: nguồn chính thức hiện liệt kê 44.3.0, phát hành 2026-09-08. Kiểm tra lại latest stable lúc cài; pin phiên bản chính xác và commit lockfile, không dùng beta/nightly.
- React/react-dom major 19; Vite major 8; Tailwind CSS major 4 với @tailwindcss/vite; shadcn/ui hỗ trợ React 19/Tailwind 4; Zustand chọn stable tương thích và khóa lockfile.
- TypeScript cho main/preload/renderer. Dùng Vite cho renderer, TypeScript biên dịch main/preload với cấu hình module rõ ràng; chọn preload .cjs để tránh phụ thuộc vào loader ESM trong sandbox.
- Node build đề xuất 22 LTS >=22.12; kiểm tra engines của phiên bản Vite 8 thực tế khi khóa dependency. Node dùng build khác Node tích hợp Electron.
- pnpm 8.15.9 làm package manager theo yêu cầu người dùng. electron-builder đóng gói installer Windows x64; xác nhận tương thích trong task packaging.
- Canvas 2D + danh sách annotation có kiểu dữ liệu để vẽ, hit-test, xóa và export. Không thêm thư viện canvas trước khi có nhu cầu đã chứng minh.
- Vitest cho thuật toán hình học, trạng thái, shortcut transaction và export; Playwright Electron cho smoke ở môi trường có desktop Windows. Không thay kiểm thử desktop thật bằng browser mock.

### Ranh giới tiến trình

- Main sở hữu vòng đời app, tray, globalShortcut, screen, desktopCapturer, capture session, clipboard, dialog và filesystem.
- Preload chỉ expose API có kiểu cho đúng thao tác cần thiết; không expose ipcRenderer hay filesystem tùy ý.
- Renderer React chứa Settings, SelectionOverlay, Editor; UI dùng shadcn/ui + Tailwind; Zustand quản lý tool, màu, stroke width, selectedId, annotations và trạng thái thao tác.
- Bật contextIsolation, sandbox, tắt nodeIntegration; CSP phù hợp dev/prod, chặn navigation/window mới ngoài dự kiến. Validate sender, session ID, payload, kích thước ảnh và kênh IPC.
- Chỉ cấu hình shortcut và thư mục gần nhất được lưu tại userData qua main. Ảnh giữ trong bộ nhớ, không tự lưu tạm hoặc log nội dung ảnh.

### Pipeline chụp

1. Chốt displayId: nút Settings/tray dùng explicit target đã validate; hotkey snapshot tọa độ con trỏ ngay trong callback. Khóa phiên để không mở chồng.
2. Ẩn cửa sổ app, đợi compositor cập nhật và lấy ảnh trước khi hiển thị overlay.
3. Main dùng desktopCapturer lấy source màn hình, match display_id với screen display; kiểm tra bitmap thật và độ phân giải, không dùng thumbnail mặc định 150x150.
4. Spike kiểm chứng getSources/thumbnail ở độ phân giải yêu cầu. Nếu bitmap trả về không đạt, thử lấy một frame từ nguồn desktop trong renderer capture cô lập với main chỉ định source; dừng stream ngay sau frame. Không chốt backend trước khi đo.
5. Full capture chuyển ảnh thẳng sang editor. Region hiển thị ảnh đóng băng trong overlay phủ bounds màn hình, dim phần ngoài, kéo thả theo mọi hướng; Escape hủy.
6. Đổi tọa độ DIP/local CSS sang pixel ảnh qua tỷ lệ bitmap thực tế/display bounds; clamp, làm tròn cạnh nhất quán và crop. Không nhân scaleFactor chung cho mọi màn hình.
7. Đóng overlay trước khi mở editor; ảnh hiển thị fit-to-window nhưng dữ liệu annotation lưu theo pixel ảnh gốc.
8. Khi unplug/đổi độ phân giải giữa phiên, hủy capture có thông báo và giải phóng lock.

### Editor và xuất ảnh

- Screenshot gốc bất biến; Annotation union baseline: arrow, rectangle, circle, freehand, blurStroke; bổ sung text và emoji theo đặc tả mở rộng. Mỗi đối tượng có ID, geometry và style phù hợp.
- Pointer Events + pointer capture để không mất nét khi kéo nhanh. Hit-test theo thứ tự từ trên xuống, có dung sai theo zoom.
- Blur pen tạo mask theo đường bút và lấy mẫu ảnh screenshot gốc đã blur; chỉ vẽ phần mask. Nét màu/hình được render phía trên lớp blur, không bị blur. Chồng nét blur không lộ khe; xóa blur khôi phục vùng gốc.
- Hàm render chung cho preview/export, xuất ở kích thước ảnh gốc; không có toolbar, con trỏ, viền chọn hay nền dim trong ảnh.
- Export flatten thành PNG thực tế; clipboard.write với ClipboardItem PNG bất đồng bộ ở main (Electron 44). Save dùng dialog native và ghi file ở main; chỉ thông báo thành công sau khi hoàn tất.
- Hủy dialog không mất ảnh; lỗi clipboard/disk hiển thị dễ hiểu, người dùng thử lại được. Không ghi đè file nếu thiếu xác nhận trong dialog.

## Luồng giao diện

Settings (hai ô ghi phím tắt + áp dụng + trạng thái đăng ký)
→ phím tắt / menu tray
→ chụp toàn màn hình hoặc overlay kéo thả
→ Editor: ảnh ở giữa, toolbar ngoài vùng ảnh
→ chọn màu/công cụ → vẽ/chọn/xóa → Copy hoặc Save → Cancel.

Toolbar baseline có các tool vẽ; bổ sung Text và Emoji, cùng điều khiển kích thước theo tool như phần mở rộng bên dưới.
Tool active có trạng thái rõ ràng; nút có tooltip và accessible label; Xóa disabled khi không có selection; Copy/Save disabled lúc xuất.

## Thứ tự công việc

1. Task 01: Khởi tạo runtime và hợp đồng IPC.
2. Task 02: Giao diện React và công cụ kiểm tra.
3. Task 03: Chụp toàn màn hình thật.
4. Task 04: Chọn vùng có chuyển đổi DPI.
5. Task 05: Phím tắt toàn cục có cấu hình.
6. Task 06: Tray và vòng đời phiên.
7. Task 07: Editor và render ảnh đúng tỷ lệ.
8. Task 08: Mũi tên có lựa chọn màu.
9. Task 09: Hình chữ nhật/vuông và hình tròn.
10. Task 10: Bút tự do.
11. Task 11: Chọn, đổi màu và xóa đối tượng.
12. Task 12: Blur pen.
13. Task 13: Copy ảnh đã flatten.
14. Task 14: Save PNG bằng dialog.
15. Task 15: Đóng gói và nghiệm thu Windows.

Dependencies: 01 → 02 → 03 → 04; 03 → 05 → 06; 03+04+06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15.
Các checkpoint chi tiết nằm tại todo.md sau mỗi 2–3 task.
Có thể tách phần Settings và geometry sau khi chốt IPC, nhưng mặc định thực hiện tuần tự để tránh tranh chấp shared state.

## Rủi ro và cách xử lý

| Rủi ro | Ảnh hưởng | Cách xử lý |
|---|---|---|
| Thumbnail không đúng độ phân giải | Cao | Spike task 03; so pixel và kích thước thật, thử frame capture nếu cần |
| DPI hỗn hợp, màn hình nằm ở tọa độ âm | Cao | Test conversion sớm, matrix 100/125/150/200%, màn hình phụ bên trái |
| Chụp lẫn overlay/app hoặc phím bị gọi liên tiếp | Cao | Capture trước overlay, session lock, kiểm tra desktop thật |
| Hotkey bị ứng dụng khác chiếm | Vừa | Kiểm tra register; rollback cấu hình và đăng ký cũ khi lỗi |
| Blur 4K chậm, kết quả export khác preview | Cao | Cache ảnh blur, mask theo stroke, chung render pipeline; đo trước tối ưu |
| Bộ nhớ tăng qua nhiều phiên | Vừa | Dispose bitmap, object URL và listener, dừng stream; kiểm tra nhiều chu kỳ |
| Màn hình đổi topology giữa capture | Vừa | Snapshot metadata, hủy sạch khi display thay đổi |
| Nội dung protected/HDR không chụp đúng | Vừa | Thử nội dung desktop SDR thông thường; mô tả giới hạn từ thử nghiệm |
| Installer thiếu signing | Vừa | Bản local chưa ký để nghiệm thu; ký/phát hành công khai là bước riêng |

## Kiểm thử và Definition of Done

Các script hiện có; dùng pnpm.cmd nếu PowerShell chặn pnpm.ps1:
- pnpm dev: chạy desktop dev.
- pnpm typecheck; pnpm build: kiểm tra kiểu và build main/preload/renderer.
- pnpm test -- <test-file>: test tập trung không watch; pnpm test: toàn bộ unit/integration.
- pnpm test:e2e: smoke Electron có desktop Windows.
- pnpm dist: build installer Windows x64.

Nghiệm thu: cả hai shortcut hoạt động ngoài focus app; đổi phím giữ qua restart; kéo 4 hướng và Escape đúng; đủ toàn bộ công cụ yêu cầu; xóa cả blur; Copy paste được vào Paint; Save chọn folder và ghi ảnh đúng kích thước; Cancel sạch phiên; installer chạy khi không có dev server.
Kiểm tra màn hình đơn và kép, scale 100/125/150/200%, ảnh 4K, cấu hình lỗi, shortcut conflict, disk lỗi và dialog cancel.
Nếu máy thiếu màn hình phụ hoặc scale cần thiết, ghi rõ chưa kiểm chứng; không đánh dấu đạt bằng mock.
Mỗi task hoàn tất khi đạt acceptance, kiểm tra liên quan, build/typecheck sạch, không lỗi runtime mới. Chỉ bổ sung tests cho hành vi/rủi ro thực, không test lặp lại JSX.
Baseline đã đạt build/typecheck, 19 unit test và smoke trên executable đóng gói; đây không thay cho các nghiệm thu thủ công còn mở. Text/Emoji/đa màn hình đã có kết quả kiểm thử 0.2.0 tại docs/windows-qa.md; phần kéo di chuyển/resize đã triển khai trong 0.3.0; kết quả kiểm thử ở docs/windows-qa.md.

## Nguồn kỹ thuật đã đối chiếu

- [Electron stable releases](https://releases.electronjs.org/?channel=stable): phiên bản stable tại thời điểm lập kế hoạch.
- [desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer): nguồn chụp và thumbnail.
- [screen](https://www.electronjs.org/docs/latest/api/screen): display và hệ tọa độ.
- [globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut): đăng ký hotkey toàn cục.
- [Vite 8](https://vite.dev/blog/announcing-vite8) và [Vite guide](https://vite.dev/guide/): nhánh phiên bản, yêu cầu build.
- [shadcn React 19/Tailwind 4](https://ui.shadcn.com/docs/tailwind-v4): tích hợp UI.

## Duyệt kế hoạch

- [x] Người dùng đã yêu cầu triển khai baseline bằng pnpm ở phiên trước.
- Các điểm có thể điều chỉnh: một hay tất cả màn hình, kéo vùng xuyên màn hình, Windows/CPU hỗ trợ, shortcut mặc định.


## Bổ sung: Text, Emoji và chọn màn hình (2026-09-09)

Trạng thái Task 16–22: code đã triển khai trong 0.2.0, needs review cho nghiệm thu thủ công; evidence ở docs/windows-qa.md. Kéo di chuyển/resize tại Task 23–27 bên dưới đã triển khai trong 0.3.0, needs review cho phần nghiệm thu thủ công.

### Vấn đề hai màn hình và cách xử lý

- Người dùng báo chỉ chụp được màn hình đang mở app. Code hiện tại trong `electron/main.ts` dùng `screen.getDisplayNearestPoint(screen.getCursorScreenPoint())` ngay khi bắt đầu capture, trước khi ẩn Settings. Bấm nút trong Settings hoặc menu tray làm con trỏ nằm trên màn hình chứa UI đó: đây là nguyên nhân xác định được cho đường bấm nút, không chứng minh hotkey cũng hỏng vì cùng nguyên nhân.
- Backend `electron/capture.ts` đã match `source.display_id` với display ID; không mặc định source đầu tiên. Cần tái hiện riêng: app ở màn A, con trỏ ở màn B, nhấn hotkey khi app khác focus. Nếu vẫn chụp A, kiểm tra display ID được resolve, bounds/scale và source được match. Chỉ log metadata, không log ảnh.
- Cách dùng tạm theo thiết kế hiện tại: kết thúc editor cũ, đưa chuột sang màn hình muốn chụp rồi nhấn Ctrl+Alt+F hoặc Ctrl+Alt+R (hoặc phím đã đổi). Đây là hành vi dự kiến từ code, chưa xác nhận trên máy người dùng.
- Settings thêm mục **Màn hình chụp** liệt kê toàn bộ display đang kết nối: Màn hình 1/2, nhãn nếu có, độ phân giải và vị trí tương đối. Nút Full screen/Select region gửi **displayId cụ thể** đã chọn. Lần đầu chọn màn hình chứa Settings; giữ lựa chọn trong phiên Settings, không thêm persistence lúc này.
- Tray thêm submenu từng màn hình với Full screen/Select region, truyền displayId của mục được chọn. Không lấy con trỏ tại vị trí menu để suy ra màn hình đích.
- Hotkey giữ hành vi **màn hình dưới con trỏ**, chốt vị trí ngay trong callback trước mọi hide/focus/await. Lựa chọn trong Settings không thay đổi hotkey. UI nêu rõ sự khác biệt này.
- Main là nơi duy nhất resolve/validate display. ID phải còn trong `screen.getAllDisplays()`; ID mất kết nối bị từ chối, không âm thầm chuyển về màn chính. Danh sách Settings/tray refresh khi topology thay đổi; subscription nếu có phải dùng kênh cố định và cleanup unsubscribe.
- Giữ lock một phiên: hotkey trong editor chỉ focus ảnh hiện tại. Chọn display mới áp dụng cho phiên chụp tiếp theo.
- Cả full và region dùng cùng display đã chốt; overlay theo bounds display đích, kể cả origin âm và mixed DPI. Vẫn không ghép hai màn hình hoặc kéo vùng xuyên hai màn hình.

### Text

- Thêm button **Text** có icon, tooltip, accessible label và trạng thái active. Chọn tool, click trên ảnh để đặt góc trên trái của text box.
- Composer hỗ trợ tiếng Việt/Unicode, nhiều dòng bằng Enter, màu và cỡ chữ 12–160 pixel ảnh gốc. Font mặc định Segoe UI; giới hạn 2.000 ký tự và 20 dòng, báo rõ khi vượt giới hạn. Không thêm rich text/font tải mạng.
- Nút **Xong** hoặc Ctrl+Enter commit; Escape hủy draft trước, không đóng cả capture. Text trắng/rỗng không tạo annotation. Copy/Save và đổi tool bị khóa khi composer còn mở; người dùng Xong/Hủy để tiếp tục.
- Chọn text bằng bounding box, đổi màu/cỡ chữ, Delete/xóa toolbar. Double-click text trong tool Select mở composer sửa; hủy sửa giữ nguyên annotation cũ. Delete/Enter/Ctrl+Enter khi đang nhập chỉ tác động composer, không xóa đối tượng hay kích hoạt hành vi toàn editor. Tôn trọng IME/composition.
- Thêm `text` annotation: ID, vị trí top-left theo pixel ảnh, content, color, fontFamily/fontSize, lineHeight. Không áp dụng brush width cho text.
- Dùng cùng font, baseline và đo glyph/line layout cho hit-test, bounds, preview và export. Tính lại dirty rectangle theo hợp bounds cũ/mới khi sửa, tránh chữ thừa sót lại. Hiển thị fit-to-window không làm giảm độ phân giải text xuất.
- Nội dung vượt cạnh phải/dưới được clip theo ảnh và preview thể hiện đúng phần sẽ xuất. Composer là UI ngoài pipeline ảnh xuất. Bản 0.2.0 chưa có kéo di chuyển/resize; yêu cầu mới được lập kế hoạch riêng tại Task 23–27 bên dưới.

### Emoji

- Thêm button **Emoji**, mở picker offline gồm tập emoji cố định khoảng 32 mục và tên accessible. Chọn emoji rồi click ảnh để đặt tại top-left; kích thước 16–256 pixel ảnh gốc, mặc định 48.
- Thêm `emoji` annotation riêng với ID, vị trí, chuỗi Unicode đầy đủ và size; không tách surrogate pair, variation selector hoặc chuỗi ZWJ. Không tự recolor emoji bằng ô màu.
- Render bằng Segoe UI Emoji trên Windows, đợi font sẵn sàng trước đo/vẽ/xuất. Chốt tập emoji sau spike kiểm tra glyph màu trên Electron/Windows hỗ trợ; không đưa glyph thiếu vào picker và không âm thầm xuất ô vuông.
- Emoji là annotation phía trên blur, có bounding box để chọn, chỉnh size và Delete. Escape đóng picker/hủy trạng thái đang đặt trước khi hủy capture. Picker hỗ trợ bàn phím và quản lý focus.
- Preview và PNG dùng chung renderer/font/bounds; không dùng DOM emoji như nguồn export riêng. Nếu font native không đáp ứng màu/độ nhất quán, ghi kết quả spike và đề xuất asset emoji đóng gói kèm license trước khi thêm dependency/asset mới.

### Luồng, kiến trúc và nghiệm thu mở rộng

- Toolbar mới: Màu + kích thước theo tool | Select + Arrow + Rectangle + Circle + Freehand + Blur + Text + Emoji | Delete | Copy + Save + Cancel.
- Annotation union và hit-test/bounds phân biệt shape, stroke, text, emoji; loại bỏ giả định mọi annotation đều có `width` hoặc `start/end/points`. Tất cả annotation màu/glyph nằm trên blur; selection/composer/picker không xuất vào PNG.
- IPC mở rộng có kiểu: danh sách display an toàn và CaptureRequest phân biệt cursor target với display target. Renderer không được cung cấp source ID desktopCapturer tùy ý. Main vẫn xác thực sender/session/payload và trạng thái topology.
- Ưu tiên sửa đa màn hình trước, rồi Text, Emoji và regression/đóng gói. Thực hiện tuần tự vì chia sẻ model/render/store/editor.
- Nghiệm thu bắt buộc: app ở A vẫn chụp B từ Settings/tray; hotkey trên B khi app khác focus; đảo A/B, origin âm, 100/125/150/200% và mixed DPI. Chụp đủ display đúng kích thước pixel và crop không chứa UI.
- Kiểm tra tiếng Việt nhiều dòng, IME, sửa/hủy, emoji màu và ZWJ, chọn/xóa/size/color đúng loại, resize cửa sổ, clip mép ảnh, blur dưới glyph, Copy/Save đúng preview và dirty-cache không sót pixel.
- Vitest kiểm tra resolver/validation/layout/bounds; Electron E2E dùng font/canvas/clipboard thật. Giữ các ca desktop vật lý chưa làm ở trạng thái chưa kiểm chứng; cập nhật docs/windows-qa.md và implementation log khi triển khai.

**Ngoài phạm vi phần bổ sung:** ghép tất cả màn hình, region xuyên display, rich text, emoji tải mạng, undo/redo. Kéo di chuyển/resize annotation được bổ sung vào phạm vi tại Task 23–27 bên dưới.


## Bổ sung: Kéo di chuyển và resize annotation bằng chuột (2026-09-09)

**Status: needs review — code Task 23–27 đã triển khai trong 0.3.0.** Build/typecheck và 59 unit tests đạt; 10 Electron desktop tests và 9 tests trên executable đóng gói đạt. Evidence và phần manual/hardware chưa kiểm chứng được ghi tại docs/windows-qa.md. Nguồn: người dùng yêu cầu giữ chuột và kéo để đổi vị trí, kéo 4 góc và 4 cạnh để đổi kích thước. Task 23–27 trong todo.md là checklist duy nhất. Giữ nguyên trạng thái và evidence Task 01–22.

### Hành vi người dùng

- Áp dụng cho một annotation đang chọn bằng Select: hình, mũi tên, nét tự do, vùng blur, Text và Emoji. Ảnh screenshot nền không bị di chuyển/resize. Không thêm chọn nhiều đối tượng, xoay hoặc undo/redo trong lần này.
- Click đối tượng để chọn; khung chọn có **8 handle**: NW/N/NE/E/SE/S/SW/W, tương ứng 4 góc và trung điểm 4 cạnh. Click khoảng trống bỏ chọn. Handle được ưu tiên hit-test trước đối tượng; nét/vùng chồng nhau vẫn theo thứ tự lớp hiển thị.
- Giữ nút chuột trái trên đối tượng hoặc phần trong khung đang chọn rồi kéo để **di chuyển**; giữ nguyên khoảng cách từ điểm nhấn tới đối tượng, không nhảy tâm về chuột. Cursor move/grab cho di chuyển; nwse/nesw/ns/ew-resize đúng handle khi resize.
- Kéo góc thay đổi hai chiều, neo góc đối diện. Kéo cạnh thay đổi chiều tương ứng, neo cạnh đối diện. Hình/nét/blur được kéo giãn tự do; hình tròn có thể thành ellipse. Shift khi kéo góc giữ tỷ lệ ban đầu. Không lật đối tượng khi kéo vượt neo; clamp về kích thước tối thiểu dương (2 pixel ảnh cho trục không suy biến).
- **Quy ước dự kiến cho Text/Emoji:** giữ tỷ lệ ở cả 8 handle để glyph không bị méo. Kéo góc neo góc đối diện; kéo cạnh neo trung điểm cạnh đối diện và căn giữa chiều còn lại. Thay đổi cỡ chữ/cỡ emoji tương ứng, giữ giới hạn Text 12–160 và Emoji 16–256 pixel gốc. Không tự xuống dòng hoặc đổi nội dung text khi kéo cạnh; giữ line breaks hiện có. Slider và drag phải phản ánh cùng kích thước hiệu dụng.
- Preview cập nhật trong lúc kéo. Pointer-up commit một lần; click không di chuyển không tạo transform. Ngưỡng bắt đầu kéo khoảng 3 CSS px để double-click Text vẫn mở composer ổn định.
- Escape trong lúc kéo chỉ hủy thao tác và phục hồi snapshot trước kéo, giữ selection và capture. Pointer-cancel/lost pointer capture hủy tương tự. Sau khi commit, Escape giữ hành vi đóng capture hiện có. Copy/Save, đổi tool, Delete và mở composer/picker bị khóa trong drag; hiện lại khi kết thúc. Không bắt drag khi đang nhập text/composition hoặc picker mở.
- Dùng pointer capture để kéo ra ngoài vùng canvas vẫn nhận được pointer-up; clamp tọa độ con trỏ vào ảnh khi resize và clamp vùng chọn hoàn toàn trong ảnh nếu ban đầu nằm gọn. Với text/annotation đã bị clip sẵn, cho phép kéo phần nhìn thấy để đưa vào ảnh, không tự thu nhỏ/nhảy vị trí lúc bắt đầu; giữ tối thiểu phần giao 2 px khi di chuyển. Handle phần vượt ảnh được hiển thị trong overlay vùng editor nếu còn trong viewport; không thay đổi bounds thật vì clipping.
- Handle khoảng 8 CSS px với hit target tối thiểu 14 CSS px, không nhỏ dần khi ảnh 4K được fit-to-window. Khung/handle chỉ là UI, không đi vào PNG/clipboard. Resize cửa sổ editor trong drag hủy thao tác về snapshot để tránh đổi hệ tọa độ giữa chừng.

### Thiết kế tích hợp

- Dùng tọa độ pixel ảnh gốc; conversion CSS ↔ pixel dùng chung với editor hiện tại. Transform được tính tuyệt đối từ snapshot ở pointer-down, không cộng dồn trên kết quả frame trước để tránh drift.
- Bổ sung transform affine theo trục cho drawing (translation, scale X/Y dương; không rotation/shear), mặc định identity cho annotation cũ. Giữ geometry local và transform chung cho paint, bounds, inverse hit-test; shape/stroke và đầu mũi tên scale nhất quán như toàn bộ đối tượng. Bounds layout riêng, không lấy padding selection làm kích thước geometry. Đường ngang/dọc hoặc stroke một điểm có bounds tương tác tối thiểu hữu hạn; không chia 0.
- Text/Emoji dùng translation và uniform resize cập nhật position/fontSize/size, layout lại bằng font đã sẵn sàng; không rasterize chữ thành ảnh. Font bounds thực tế có thể không tuyến tính tuyệt đối, phải tái tính và giữ neo sau resize. Shared layout phải được dùng cho handles, hit-test, render và export.
- Blur chỉ transform **mask**, rồi áp dụng mask lên bản ảnh gốc đã blur ở vị trí mới; không kéo bitmap vùng cũ sang chỗ mới. Kích thước vùng mask thay đổi, mức blur hiện có giữ nguyên; blur vẫn dưới annotations màu/glyph và overlap không compound.
- Store Zustand giữ annotations đã commit/selection; drag snapshot và preview ngắn hạn ở ref/state editor. Commit qua replace hiện có; draft không mutate annotation cũ. Renderer nhận preview thay annotation theo ID, invalidate hợp bounds cũ/mới kể cả stroke overhang. Hủy trả lại ảnh đúng, không sót bóng glyph/mask.
- Overlay handles có accessible label mô tả góc/cạnh. Vẫn giữ slider size và Delete hiện tại; không thêm thư viện canvas/drag nếu các primitive Canvas/Pointer Events hiện có đáp ứng.

### Nghiệm thu và rủi ro

- Unit: 8 neo/cạnh, aspect lock, clamp, origin và zoom conversion, kích thước tối thiểu, đường suy biến, inverse hit-test, không drift sau nhiều move, hủy phục hồi snapshot.
- Electron: drag từng loại, đủ 8 handle, Text tiếng Việt nhiều dòng/Emoji ZWJ, double-click sau drag, Escape/pointer-cancel, clipping, resize cửa sổ, slider sau drag, preview và PNG/clipboard không chứa handles và không sót pixel sau move/resize/delete.
- Fixture blur có nền khác nhau tại vị trí cũ/mới để phát hiện lỗi kéo nhầm bitmap; pixel export phải bằng fresh render từ annotations đã commit. Đo lại renderer 4K với annotation transform, duy trì ngưỡng regression hiện tại; ghi rõ giới hạn so với latency desktop thật.
- Smoke executable đóng gói với pnpm; giữ regression hai màn hình, hotkey, Copy/Save và cleanup. DPI vật lý/mixed DPI, native IME hoặc phần cứng chưa có evidence vẫn để needs review.
- Quy ước Text/Emoji giữ tỷ lệ và hình/nét scale cả stroke là mặc định của plan, có thể điều chỉnh theo feedback trước khi triển khai. Đã triển khai theo quy ước trên trong 0.3.0; còn review các trường hợp thủ công/phần cứng được liệt kê trong QA.



## Bổ sung: Xoay 360° và viền chữ nhật đều khi resize (2026-09-10)

**Status: needs review — đã triển khai theo yêu cầu “implement đi”.** Người dùng yêu cầu cập nhật plan, bổ sung xoay mũi tên, hình chữ nhật/vuông, text, icon và kiểm tra các cạnh không đều khi resize. Task 28–33 trong todo.md là checklist thực hiện; giữ nguyên evidence và checkbox lịch sử. Phần này thay thế quy ước không rotation và scale cả stroke đối với rectangle trong Task 23–27.

### Kết quả kiểm tra code và cách hiểu yêu cầu

- `src/editor/transform.ts`: resizeAnnotation lưu scale X/Y độc lập cho drawing. `src/editor/render.ts`: paint gọi ctx.scale(t.sx, t.sy) trước khi stroke với a.width. Vì vậy rectangle bị scale cả nét: cạnh dọc có độ dày width × sx, cạnh ngang width × sy. Ví dụ width = 4, sx = 2, sy = 1 tạo cạnh dọc 8 px và ngang 4 px. Đây là nguyên nhân xác định qua code; chưa tái hiện bằng đo pixel desktop trong lần lập plan này.
- Test transform hiện kiểm tra neo, bounds, clamp và preview/export đồng nhất; chưa kiểm tra độ dày bốn cạnh. Hai ảnh giống nhau vẫn có thể cùng mang lỗi viền.
- Hiểu “size các cạnh không đều” là độ dày viền không đều. Chiều dài ngang/dọc của chữ nhật vẫn được thay đổi độc lập; Shift khi kéo góc giữ tỷ lệ, Shift khi vẽ tạo vuông. Hiểu “icon” là annotation Emoji hiện có, không thêm import SVG/ảnh.

### Hành vi cần đạt

- Rectangle/vuông giữ nguyên độ dày width theo pixel ảnh gốc khi resize cả đều và không đều. Chỉ geometry đổi kích thước; bốn cạnh cùng độ dày. Màu, góc bo nét và slider width vẫn hoạt động. Preview và Copy/Save dùng chung quy tắc.
- Select mũi tên, rectangle/vuông, Text hoặc Emoji hiện handle xoay riêng phía trên khung chọn; kéo tự do đủ 360° theo hai chiều quanh tâm đối tượng. Khung và tám handle resize quay cùng đối tượng, hit target giữ kích thước CSS khi zoom; handle xoay có accessible label và hiển thị góc hiện tại. Shift khi xoay snap 15°; Shift khi resize góc giữ nghĩa khóa tỷ lệ.
- Tâm xoay lấy từ tâm bounds hình học/layout không có padding UI, cố định theo snapshot lúc bắt đầu kéo. Góc dương theo chiều kim đồng hồ, lưu radian chuẩn hóa [0, 2π); hiển thị độ [0, 360). Đi qua 0°/360° không nhảy; xoay không đổi size, vị trí tâm hoặc stroke width.
- Tọa độ con trỏ cho xoay được đổi sang pixel ảnh nhưng không clamp vào ảnh để kéo tròn ngoài canvas vẫn đúng. Khi con trỏ sát tâm, giữ góc hợp lệ gần nhất. Cho phép phần đối tượng xoay vượt biên và clip theo screenshot, không tự co nhỏ hoặc dịch tâm để ép vào ảnh. Handle ngoài ảnh còn trong viewport vẫn thao tác được.
- Sau xoay vẫn chọn, di chuyển, resize đủ tám handle, đổi màu/size theo loại, sửa text và xóa được. Resize theo trục local đã xoay, giữ neo đối diện trong tọa độ ảnh; Text/Emoji luôn uniform và giữ giới hạn size hiện có. Không flip hoặc drift qua nhiều chuỗi resize → rotate → move.
- Pointer-up commit; Escape, pointercancel, lost capture hoặc đổi kích thước cửa sổ hủy về snapshot. Copy/Save, đổi tool và sửa text bị khóa trong drag như hiện tại. Click không kéo không tạo thay đổi. Composer giữ góc cũ khi sửa text; giữ điểm đặt local khi layout đổi, chỉ chốt lại tâm từ layout mới sau commit, tránh nhảy trong drag.
- Không bổ sung rotation cho circle/freehand/blur trong phạm vi này. Giữ hành vi resize hiện có của chúng và mũi tên; không tự đổi stroke policy của loại khác. Không thêm undo/redo hoặc xoay ảnh nền.

### Thiết kế và thứ tự tích hợp

1. Sửa rectangle trước: áp dụng transform scale/translation vào tọa độ đường viền rồi stroke một lần với width không scale. Bounds và hit-test dùng chính geometry đã biến đổi cộng nửa độ dày nét; không sửa bằng cách chia lineWidth cho một tỷ lệ trung bình vì không xử lý đúng sx khác sy. Tách bounds geometry, bounds có stroke và padding UI; giữ neo/clamp khi thay đổi quy tắc stroke.
2. Bổ sung rotation tùy chọn cho bốn loại hỗ trợ, mặc định 0 cho dữ liệu cũ. Dùng thứ tự local geometry → scale/translation hiện có → rotate quanh tâm trong tọa độ ảnh; glyph vẫn resize bằng fontSize/size. Các helper dùng chung trả tâm, góc, bốn góc oriented bounds, world AABB và phép biến đổi thuận/nghịch. Không chỉ thêm ctx.rotate mà bỏ qua bounds/hit-test.
3. Paint áp rotation trong save/restore; rectangle stroke sau scale geometry để viền đều. Hit-test inverse rotation trước khi xét geometry; dung sai dựa trên zoom. Dirty region là hợp world AABB cũ/mới gồm stroke/arrowhead và padding khử răng cưa, kể cả lúc cancel/delete. Preview và export dùng cùng renderer.
4. Overlay dùng oriented frame; resize đổi delta về trục local và giải lại translation để neo world không đổi. Clamp resize dựa trên các góc world đã xoay, không dùng giới hạn axis-aligned cũ trực tiếp. Khi ban đầu fit trong ảnh thì giữ fit; trường hợp đã clip giữ quy ước không nhảy và tối thiểu phần giao khi move.
5. Nối rotate drag từ snapshot vào Editor, pointer capture và commit hiện có; Zustand giữ annotation đã commit. Kiểm tra composer/slider không làm mất rotation, layout/font bounds mới nhất dùng chung cho chọn và xuất.

### Nghiệm thu và rủi ro

- Unit: rotation 0/45/90/180/270/360°, góc qua seam theo cả hai chiều, inverse round-trip, world AABB, tám neo resize sau xoay, min/max glyph size, đường mũi tên ngang/dọc, snapshot không mutate và không drift.
- Electron pixel test trên fixture nền phẳng: rectangle resize ngang/dọc/đều, phóng to rồi thu nhỏ nhiều lần, kiểm tra độ dày bốn cạnh ở 0° và 90° (dung sai tối đa 1 pixel khử răng cưa); 45° đo theo pháp tuyến cạnh hoặc so fixture hình học độc lập. Không chỉ so preview với export.
- E2E: kéo xoay đủ bốn loại, snap, cancel, resize/move sau xoay, text tiếng Việt nhiều dòng và emoji ZWJ, sửa text/slider, clipping, xóa, Copy/Save không chứa handles; so incremental render với fresh render để phát hiện pixel sót.
- Rủi ro chính: thứ tự transform gây lệch tâm/neo, bounds thiếu vùng quay, font layout đổi làm nhảy vị trí, clamp ngăn xoay đủ vòng sát biên. Task geometry và pixel regression làm trước UI; giới hạn phần cứng/DPI chưa thử tiếp tục ghi needs review.
- Kiểm tra khi triển khai: pnpm.cmd typecheck; pnpm.cmd test; pnpm.cmd build; Electron E2E liên quan transform/render và regression hiện có; smoke executable đóng gói. Cập nhật QA với evidence thực tế, không tự publish.

### Kết quả triển khai (2026-09-10)

- Task 28–30 done; Task 31–33 code complete, needs review cho nghiệm thu manual/hardware. Giữ checkbox/evidence Task 01–27.
- Pixel regression tái hiện nét 8 px bị kéo thành 16 px trước sửa; sau sửa bốn cạnh giữ width. Rectangle scale geometry rồi stroke, có kiểm thử path tham chiếu độc lập cho góc 45°/90° và các góc khác.
- Rotation dùng helper chung trong transform.ts (render.ts re-export bounds), oriented handles và neo world; inverse hit-test, dirty AABB và export đồng bộ. Glyph composer/slider bù translation để giữ điểm đặt trên ảnh khi layout và tâm thay đổi trong preview; tâm drag luôn cố định từ snapshot.
- Typecheck/build, 89 unit tests và 14/14 desktop E2E cuối đạt; 11/11 tests trên Screenshot.exe đóng gói đạt. Kết quả desktop, timing 4K và lần chạy lại được ghi trong docs/windows-qa.md. Có ảnh QA nền tổng hợp tại docs/images/rotation-preview.png.
- Installer local: release/windows-x64-rotation/Screenshot-Setup-0.3.3-windows-x64.exe. Giữ package version 0.3.3, không commit/tag/publish. Native Save/IME, DPI vật lý 125/150/200% và mixed DPI, Windows 11 và installer wizard vẫn chưa nghiệm thu.
## Bổ sung: Chèn ảnh và biến đổi đối tượng ảnh (2026-09-10)

**Status: implemented, needs manual review — đã triển khai sau yêu cầu “làm tiếp”.** Yêu cầu cập nhật kế hoạch; Task 34–39 trong todo.md là phần bổ sung. Giữ nguyên trạng thái và nghiệm thu Task 01–33.

### Kết luận khả thi và bằng chứng

- Khả thi, mức thay đổi vừa, chưa thấy cần thêm thư viện canvas. Annotation hiện chỉ có drawing/text/emoji trong src/editor/model.ts; cần thêm loại image.
- src/editor/transform.ts đã có move, resize theo trục local, neo đối diện và rotation; SelectionHandles.tsx đã có tám handle và nút xoay. Cần mở rộng canRotate, frameBounds, resizeLocal và hit-test cho image. Đặc biệt không dùng kiểm tra 'position' in a để coi mọi đối tượng có position là glyph: ảnh cũng có position nhưng phải resize theo width/height.
- src/editor/render.ts dùng chung Renderer cho preview/export và dirty-region theo bounds. Thêm drawImage vào pipeline này, dùng cache ảnh đã decode và nguồn SVG đã kiểm tra, tránh decode ở mỗi pointermove hoặc xuất thiếu ảnh chưa sẵn sàng.
- electron/main.ts đã có dialog Save, kiểm tra sender/session và IPC hẹp; shared/contracts.ts và electron/preload.cts chưa có import ảnh. Bổ sung một API chỉ chọn/đọc ảnh do người dùng chọn.
- src/stores/editor.ts có add/replace/remove/reset, chưa có undo/redo. Tính năng mới dùng các thao tác hiện có, không đưa undo/redo vào phạm vi.
- Electron hỗ trợ hộp thoại native chọn file với filters và cửa sổ cha: https://www.electronjs.org/docs/latest/api/dialog . Dùng openFile, không openDirectory: người dùng duyệt thư mục rồi chọn một file ảnh.

### Hành vi và phạm vi đề xuất

1. Nút Chèn ảnh trên toolbar có tooltip/accessible label, mở hộp thoại Windows chọn một PNG, JPG, JPEG, SVG hoặc WebP mỗi lần; có thể lặp lại để chèn nhiều ảnh. Đây là đối tượng phủ lên screenshot hiện tại, không thay ảnh nền.
2. Chèn ở tâm screenshot, tự chọn đối tượng và chuyển sang Select. Kích thước khởi tạo giữ tỷ lệ gốc, không phóng lớn ảnh nhỏ, giới hạn trong 60% chiều rộng và chiều cao screenshot để thấy các handle. Tất cả tọa độ/kích thước lưu theo pixel screenshot gốc.
3. Kéo di chuyển; tám handle resize, mặc định đổi hai chiều độc lập như rectangle; Shift + kéo góc giữ tỷ lệ hiện tại. Kích thước tối thiểu 2 px mỗi chiều, không flip. Xoay tự do 360° quanh tâm, Shift snap 15°, giữ hành vi clamp/clip và hủy drag như editor hiện có.
4. Khi chọn ảnh, thay điều khiển màu/độ dày bút bằng ô W/H theo pixel và khóa tỷ lệ (mặc định bật). Nhập size giữ tâm và góc, khóa tỷ lệ dùng tỷ lệ hiện tại; giá trị không hữu hạn, âm hoặc quá giới hạn bị từ chối. Áp dụng cùng giới hạn biên như resize kéo; nếu kích thước không phù hợp thì báo lỗi và giữ giá trị cũ. Không mở rộng canvas. Enter/blur commit giá trị hợp lệ, Escape hoàn nguyên; không kích hoạt phím xóa/hủy phiên khi đang gõ.
5. Ảnh mới nằm trên các annotation trước; chọn theo thứ tự hiển thị, click cả vùng trong suốt trong khung ảnh vẫn chọn được. Xóa bằng Delete/nút Xóa. PNG, SVG và WebP giữ alpha; rotate/resize không làm đổi dữ liệu nguồn. Copy/Save flatten ảnh đúng vị trí/kích thước/góc ở độ phân giải screenshot.
6. Hủy dialog không thay đổi editor. Khóa thao tác import trùng và Copy/Save trong lúc import/decode; chặn mở dialog khi đang vẽ/drag/composer/picker. Trả focus về canvas; Escape ở dialog chỉ hủy dialog. Nếu phiên kết thúc trong lúc chờ, bỏ kết quả và giải phóng tài nguyên.
7. V1 không gồm phát animation, GIF, chỉnh sửa path bên trong SVG, crop ảnh chèn, lật, opacity, kéo file từ Explorer, paste ảnh hoặc quản lý layer mới. Blur tiếp tục chỉ tác động screenshot nền như hiện tại; ảnh chèn nằm trên lớp blur.

### Thiết kế tích hợp

- API dự kiến importImage(sessionId): Promise<Result<ImportedImage | null>>; null là hủy. Main tự mở dialog với parent editor, chỉ đọc file được chọn; renderer không truyền đường dẫn tùy ý. Validate sender/session trước và sau await, chặn request đồng thời và giải phóng lock bằng finally.
- PNG/JPG/JPEG/WebP kiểm tra byte signature, byte length, kích thước header trước decode và kết quả decode; SVG kiểm tra XML/root SVG và kích thước viewport/viewBox theo quy tắc bên dưới; xử lý EXIF orientation JPEG nhất quán, không dựa riêng phần mở rộng. Giới hạn đề xuất: 20 MiB/file, 24 megapixel và 16384 px mỗi cạnh; ngân sách tổng ảnh đã decode 128 MiB/phiên tính width × height × 4 (không phải trần RAM tổng, còn có buffer trung gian). Chốt/điều chỉnh bằng đo bộ nhớ trong Task 34/35.
- Annotation image: id, type, assetId, position, width, height, rotation. Asset cache giữ nguồn/bitmap và natural dimensions trong RAM theo phiên; Zustand chỉ giữ dữ liệu đối tượng, không clone bitmap theo lần resize. Chỉ add sau decode thành công và kiểm tra phiên vẫn hiện hành; lỗi không để lại đối tượng rỗng.
- Cache cung cấp nguồn đồng bộ cho paint/drawImage và export, báo lỗi nếu asset thiếu; không xuất im lặng thiếu ảnh. Delete/reset/unmount giải phóng asset không còn tham chiếu và object URL nếu có. Không log/upload bytes, ghi capture/ảnh chèn ra file tạm hoặc sửa file nguồn.
- Image có bounds riêng không cộng stroke; inverse rotation cho hit-test. Dirty region bao trùm world bounds cũ/mới khi move/resize/rotate/delete/cancel. Paint save/restore và drawImage giữ alpha, preview/export cùng resolver.
- Dùng Zustand selectors và shadcn component hiện có cho UI; không thêm generic filesystem API hoặc nới CSP cho file://. Các type guard drawing/glyph phải được rà soát khi mở rộng union.

### Thứ tự thực hiện và kiểm chứng

34 (import IPC và giới hạn đầu vào) → 35 (đối tượng, asset và render) → 36 (button nối luồng chọn/chèn) → 37 (move/resize/rotate) → 38 (nhập W/H) → 39 (E2E và nghiệm thu). Checklist chi tiết và checkpoint nằm trong todo.md.

Rủi ro chính: bitmap lớn tăng RAM; decode bất đồng bộ trả về phiên cũ; resize ảnh bị nhầm glyph; sai neo khi xoay; preview/export khác nhau; native dialog làm mất focus. Kiểm tra bằng unit geometry/validation/lifecycle và Electron E2E với ảnh fixture, cộng manual dialog Windows. Kết luận hiện là đánh giá code/API, không phải kết quả chạy thử tính năng. Đây là kết luận của bước lập kế hoạch ban đầu; kết quả triển khai và kiểm chứng nằm ở phần dưới.

### Cập nhật định dạng theo yêu cầu: PNG, JPG, JPEG, SVG, WebP

- File filter nhận png, jpg, jpeg, svg, webp, không phân biệt hoa/thường; JPG và JPEG dùng cùng decoder/MIME image/jpeg. Cả năm đuôi file có cùng thao tác select/move/resize/W/H/rotate/delete và Copy/Save PNG.
- Decode raster bằng khả năng image của Chromium trong renderer sandbox sau validation đầu vào; không giả định nativeImage hỗ trợ mọi định dạng. WebP lossy/lossless và alpha đều thuộc phạm vi. Với WebP động, lấy frame đầu tiên thành bitmap tĩnh trước khi add; kiểm chứng decoder frame-index trên Electron hiện tại trong Task 34. APNG cũng dùng frame đầu, tránh preview thay đổi theo thời gian trong khi export cố định. Nếu decoder thất bại, báo lỗi rõ ràng, không silently bỏ ảnh.
- SVG được dùng như một ảnh vector tĩnh, không chèn markup vào DOM ứng dụng, iframe hoặc object. Parse XML đúng cách, không dùng regex làm bộ kiểm tra SVG; không xử lý DTD/entity, script, event handler, foreignObject hoặc animation. Từ chối file có các nội dung này với thông báo cụ thể. Chỉ chấp nhận tham chiếu fragment nội bộ cho gradient/clip/mask/use; tài nguyên ngoài, CSS import, font từ URL và image nhúng ngoài phạm vi V1 bị từ chối trước khi render. Không tải network/local file từ nội dung SVG.
- SVG kích thước tuyệt đối hợp lệ được quy đổi sang CSS px; nếu chỉ có viewBox thì dùng width/height của viewBox làm kích thước logic. Với kích thước phần trăm/thiếu kích thước, dùng viewBox hữu hạn và dương; không có viewport xác định thì báo lỗi. Giữ đúng viewBox origin và preserveAspectRatio. Font ngoài không được tải; logo cần font đặc biệt nên chuyển text thành path để giữ hình thức.
- Giữ nguồn SVG đã kiểm tra trong RAM để render lại theo kích thước đích, không đóng băng thành bitmap nhỏ lúc import. Trong drag có thể dùng cache; khi commit và trước export phải sẵn sàng raster ở độ phân giải cần thiết, có tính góc/scale và giới hạn bộ nhớ. Preview/export dùng chung nguồn và quy tắc raster; export vẫn flatten PNG, không xuất SVG hay chỉnh path. Nếu kích thước raster vượt ngân sách, từ chối thay đổi với thông báo thay vì xuất ảnh thiếu hoặc giảm chất lượng âm thầm.
- Giới hạn byte/pixel/cạnh và ngân sách cache ở trên vẫn áp dụng; SVG bổ sung giới hạn độ phức tạp và thời gian decode, chốt bằng spike với SVG có filter/path/use phức tạp trước tích hợp. Raster cache SVG cũ phải được giải phóng khi thay size; không raster mới trên mỗi pointermove. Chưa khẳng định hỗ trợ mọi SVG tùy ý: nghiệm thu tập con SVG tĩnh, độc lập tài nguyên nêu trên.
- Bổ sung fixture: .jpg và .jpeg riêng, WebP lossy/lossless/alpha/animated first-frame, APNG first-frame, SVG viewBox-only/gradient/clip/mask/use nội bộ/alpha; SVG lỗi/DTD/script/link ngoài/animation phải bị từ chối. Kiểm tra SVG phóng lớn rồi xoay, cache cập nhật và pixel preview/export; xác minh không phát sinh request tài nguyên ngoài.
- Nguồn đối chiếu: [SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image) mô tả hạn chế trong image context; [Image formats](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types) mô tả JPEG, PNG, SVG và WebP. Các quy tắc từ chối và cache trên là thiết kế của app; cần kiểm chứng bằng fixture khi triển khai.
### Kết quả triển khai (2026-09-10)

Task 34–38 đã có code; Task 39 hoàn tất kiểm thử tự động và review ảnh UI tổng hợp, còn manual. Build/typecheck và 95 unit tests đạt. Toàn bộ 14 test E2E cũ đạt qua full run và focused rerun sau cập nhật whitelist API; test chèn ảnh mới đạt, gồm năm đuôi file, WebP/APNG khung đầu, EXIF JPEG, resize sau xoay, W/H, Copy pixel equality, Save integration, cancel và giải phóng asset. Evidence và giới hạn: docs/windows-qa.md.

Điều chỉnh thiết kế theo kiểm chứng: JPEG dùng HTML image decoder để áp EXIF; PNG/WebP dùng ImageDecoder frame 0. Preview/export dùng chung composition canvas để giữ pixel nhất quán. SVG raster cache theo size, cập nhật trong lịch render requestAnimationFrame, không decode XML lại trên mỗi thao tác. Tập con SVG hỗ trợ được liệt kê trong README; filter, stylesheet và embedded image bị từ chối. Ngân sách ảnh 128 MiB không bao gồm toàn bộ RAM app. Native Open/Save chooser và DPI khác 100% chưa được nghiệm thu thủ công; chưa tạo installer mới.
## Bổ sung: Giữ độ dày nét circle/freehand khi resize (2026-09-10)

**Status: implemented, needs manual review.** Task 40–41 done; Task 42 đạt kiểm thử tự động và review ảnh, còn nghiệm thu thủ công/phần cứng. Task 40–42 mở rộng cách sửa rectangle của Task 28. Giữ nguyên evidence/checkbox Task 01–39. Phần này thay thế quy ước scale cả stroke cho circle/freehand ở Task 23–27 và ngoại lệ giữ hành vi cũ của chúng ở Task 28–33.

### Kết quả rà soát

- src/editor/render.ts: rectangle transform tọa độ trước rồi stroke với a.width; circle/freehand vẫn qua ctx.scale trước khi stroke. Resize đều làm nét to/nhỏ; resize lệch trục làm nét và đầu bút bị dẹt. Đây là bằng chứng từ code, chưa phải đo pixel desktop trong lần lập plan này.
- src/editor/transform.ts: frameBounds cộng width/2 trước scale cho circle/freehand; resizeLocal chỉ tách stroke khỏi geometry cho rectangle. Chỉ sửa paint sẽ để lại lỗi khung, neo kéo và vùng redraw.
- src/editor/hit-test.ts: circle/freehand dùng inverse scale với tolerance chia scale nhỏ nhất; cần đồng bộ với stroke cố định trong tọa độ ảnh, nhất là ellipse dẹt.

### Quy tắc và thiết kế

1. Resize chỉ đổi geometry, giữ a.width theo pixel screenshot gốc như rectangle: nét 8 px vẫn 8 px khi kéo ngang/dọc/đều hoặc thu nhỏ. Zoom giao diện vẫn phóng toàn bộ ảnh; người dùng vẫn thay width bằng điều khiển độ dày.
2. Circle có thể thành ellipse khi kéo lệch tỷ lệ; Shift + kéo góc giữ tỷ lệ hiện tại. Tính tâm/bán kính ellipse sau transform rồi stroke width cố định, không scale context chứa nét hoặc chia lineWidth theo tỷ lệ trung bình. Tôn trọng geometry circle hiện tại: bán kính gốc theo chênh lệch X, tâm theo start/end.
3. Freehand transform từng điểm rồi stroke polyline một lần với round cap/join và width cố định. Một điểm vẫn là chấm tròn đường kính width; điểm trùng không gây NaN/mất nét. Giữ dữ liệu local và transform, không mutate điểm gốc hoặc nhân dồn geometry qua mỗi lần kéo.
4. Đồng bộ frameBounds, annotationBounds, resizeLocal: geometry sau transform cộng width/2 trong pixel ảnh; padding khử răng cưa/UI tách riêng. Giữ tám neo đối diện, Shift, clamp biên, không flip và minimum 2 px cho trục geometry không suy biến. Freehand ngang/dọc/một điểm có khung tương tác hữu hạn; trục suy biến không chia 0 hoặc bịa thêm geometry. Chấm một điểm giữ đường kính, chỉ thay vị trí theo neo nếu có.
5. Hit-test freehand đo khoảng cách tới đoạn/điểm sau transform. Ellipse đo khoảng cách Euclidean tới biên trong pixel ảnh rồi so width/2 + tolerance theo zoom; dùng thuật toán ổn định hoặc xấp xỉ sai số tối đa 0.25 px ảnh được kiểm chứng, có xử lý bán kính gần 0. Không dùng khoảng cách circle inverse-scale với một hệ số bù chung. Click lòng rỗng xa viền không chọn.
6. Dirty region chứa đủ nét cũ/mới sau resize/move/đổi width/cancel/delete; preview và Copy/Save cùng pipeline. Giữ hành vi arrow/blurStroke; không áp nhầm freehand policy cho blur chỉ vì cùng có points. Không thêm rotation cho circle/freehand.

### Thứ tự và kiểm chứng

Task 40 circle/ellipse → Task 41 freehand → Task 42 pixel/E2E/export. Checklist trong todo.md.

- Pixel fixture tổng hợp với scale (2,1), (1,2), (2,2), (0.5,0.75), kéo lớn/nhỏ lặp lại. Nét 8 px sai lệch tối đa 1 px khử răng cưa tại mẫu không tự chồng/góc nối. Ellipse đo bốn cực và mẫu chéo theo pháp tuyến; freehand đo ngang/dọc/chéo. Cap/join/chấm so path tham chiếu độc lập, không chỉ so preview/export vì cả hai có thể cùng sai.
- Unit kiểm tra bounds đủ width/2, tám neo, Shift, clamp, snapshot bất biến, không drift, nét ngang/dọc/một điểm/điểm trùng và hit trong/ngoài ngưỡng ở ellipse dẹt. Đổi width sau resize đồng bộ hình/bounds/click chọn.
- E2E vẽ → chọn → resize → move → đổi width → Copy/Save; cancel/delete không sót pixel; incremental render khớp fresh render. Regression rectangle/rotation, arrow/blur/image; smoke zoom và freehand nhiều điểm để phát hiện hồi quy tốc độ kéo.
- Chạy pnpm.cmd typecheck, pnpm.cmd test, pnpm.cmd build và E2E liên quan khi triển khai. QA chỉ dùng ảnh tổng hợp, ghi rõ native Save dialog/DPI chưa thử.
- Rủi ro: khoảng cách ellipse dẹt sai, nhảy neo khi bỏ stroke khỏi resize, mất nét suy biến, redraw thiếu padding. Kiểm chứng geometry/pixel trước nghiệm thu tương tác. Phần trên là thiết kế được duyệt; kết quả triển khai ghi bên dưới.

### Kết quả triển khai stroke circle/freehand (2026-09-10)

- Task 40–41 done: paint geometry trước stroke cố định; bounds/resize/hit-test đồng bộ. Ellipse distance bisection có xử lý trục/bán kính suy biến; freehand giữ round cap/join/dot, điểm gốc bất biến, Shift thu nhỏ nét một chiều đúng.
- Bổ sung ngoài danh sách file dự kiến nhưng thuộc tiêu chí đổi width: src/stores/editor.ts và tests/store.test.ts để chọn circle/freehand nạp đúng Size và cập nhật width của đối tượng đã chọn.
- Task 42 automated/visual đạt: build/typecheck, 112 unit tests, 1 E2E mới + 6 E2E hồi quy. Pixel tham chiếu độc lập khớp; nét ellipse 8 px trong sai số 1 px; Copy/Save đúng pixel; tám handles/cancel/window resize qua test transform hiện có. 4K Canvas p95 8.80 ms; freehand 10.000 điểm được chạy trong test mới.
- Hai sai lệch incremental/fresh ở nét freehand dày đã được tái hiện và sửa bằng padding redraw bảo thủ quanh round joins. Ảnh QA nền tổng hợp Circle.png/Freehand.png đã được xem; evidence và đường dẫn ở docs/windows-qa.md.
- Needs review: native Save/Paint, DPI vật lý 125/150/200% và mixed DPI, physical 4K, nghiệm thu zoom/edge thủ công rộng hơn. Giữ version 0.3.5; không tạo installer, commit/tag hoặc publish.

## Bổ sung: Mũi tên giữ nét và đầu nhọn khi resize (2026-09-10)

**Status: implemented, needs manual review.** Nguồn: người dùng yêu cầu “check lại cả mũi tên nữa nó cũng đang bị” sau Task 40–42. Task 43 thay thế ngoại lệ giữ scale stroke cũ cho arrow; các trạng thái/evidence cũ giữ nguyên.

- Rà soát xác nhận arrow còn qua ctx.scale trước stroke; đầu nhọn cũng bị kéo lệch. Đã transform hai đầu shaft trước, stroke với width cố định và dựng lại đầu nhọn cân đối theo hướng mới và Size. Giữ giới hạn đầu nhọn tối đa 60% chiều dài shaft cho mũi tên rất ngắn.
- arrowGeometry dùng chung cho paint/bounds/hit-test; resize scale shaft với min/clamp, giữ neo đối diện sau xoay. Trục ngang/dọc không sinh geometry giả; Shift thu nhỏ trục còn chiều dài. Tăng padding redraw cho nét arrow để tránh clip sát làm khác rasterization.
- Zustand Size nạp/cập nhật arrow được chọn. preserveArrowTip giữ toàn bộ shaft ở vị trí world cũ khi đổi width sau xoay. Không đổi blur mask policy.
- Kiểm chứng: build/typecheck, 123 unit tests; 11 test arrow mới. E2E stroke mở rộng có path tham chiếu độc lập, nét 8 px, đầu nhọn sau scale/xoay, short arrows, incremental/fresh/export, UI Size và Copy/Save đúng pixel. Ảnh Arrow.png nền tổng hợp đã xem.
- Bộ liên quan lần đầu 6/7 đạt; test move mọi drawing nhận delta 0 thay vì 35 px. Chạy riêng lại cả hai test transform đạt, không sửa code; chưa xác định nguyên nhân lần tương tác thất bại. Bảy test E2E khác nhau đều đạt qua các lần chạy. Chi tiết ở docs/windows-qa.md.
- Còn manual native Save/Paint, physical DPI/mixed DPI/4K và zoom/edge rộng hơn. Giữ version 0.3.5; chưa tạo installer/commit/tag/publish.



## Bổ sung: Nút xoay toàn bộ ảnh chụp (2026-09-10)

**Status: implemented — Task 44–45 done; Task 46 needs manual/hardware review.** Theo yêu cầu update plan, bổ sung Task 44–46; giữ nguyên trạng thái công việc trước.

### Hành vi
- Thêm một nút toolbar `Rotate screenshot 90° clockwise`, có icon, tooltip và accessible label. Mỗi lần bấm xoay toàn bộ ảnh cùng chú thích 90° theo chiều kim đồng hồ; bốn lần trở về hướng ban đầu.
- Text, emoji, ảnh chèn, hình vẽ và blur xoay cùng screenshot, vẫn chỉnh sửa riêng được. Không flatten annotation khi xoay.
- Đổi W/H hiển thị và xuất ở 90°/270°, tự fit vùng làm việc; Copy/Save PNG đúng hướng và độ phân giải, không cắt góc hoặc thêm khoảng trống.
- Khóa nút khi chưa ready, đang import/output/vẽ/drag/composer/picker; trả focus canvas sau click. Phiên mới reset 0°.
- V1 chỉ có bước 90°; không bổ sung xoay toàn ảnh tùy ý, flip hoặc undo/redo.

### Thiết kế tích hợp
- Editor.tsx hiện dùng capture.width/height cho canvas, fit, pointer, handles, footer. Rotation trong transform.ts là rotation từng annotation; cần thêm orientation toàn scene.
- Lưu quarter-turns 0–3 trong Zustand, reset theo phiên. Giữ capture và annotation trong tọa độ gốc để tránh sai số và giữ blur đúng nguồn.
- Helper thuần dùng chung cho kích thước theo hướng, tọa độ thuận/nghịch và vector drag. Phân biệt tọa độ biên với chỉ số pixel trong test.
- Render scene trong tọa độ gốc, quay toàn scene tại bước trình bày và export. Cache/dirty-region giữ ở không gian gốc; đổi hướng redraw toàn vùng đích. Không chỉ xoay CSS khiến layout/export lệch nhau.
- Pointer/drag quy đổi về tọa độ gốc; overlay handles chuyển ra hướng hiển thị. Rà soát fit, text/emoji placement, insert-at-center, W/H và clamp resize. W/H ảnh chèn vẫn là kích thước local.
- Giữ IPC/session ID; kiểm tra output validator chấp nhận W/H hoán đổi. Tái sử dụng buffer, giải phóng theo phiên; không ghi ảnh tạm.

### Thứ tự và rủi ro
44 (state/geometry) → 45 (button/preview/interactions/export) → 46 (regression/QA). Checklist trong todo.md.
Rủi ro: pointer/handles sai hướng, blur lệch nguồn, export sai W/H, tăng RAM. Kiểm chứng bằng ảnh không vuông có bốn góc khác màu, cả bốn hướng, chỉnh sửa sau xoay và so pixel xuất với tham chiếu độc lập.

### Kết quả triển khai xoay ảnh

Đã thêm nút xoay 90°, Zustand quarter-turns, preview/fit/pointer/handles/export đồng bộ và PNG validator nhận đúng W/H gốc hoặc hoán đổi. Không thay IPC. Build/typecheck, 126 unit tests và 7 E2E liên quan đạt; đã xem ảnh UI tổng hợp. So pixel dirty/full redraw dùng software rasterization do GPU có sai khác antialias giữa lần vẽ; app giữ cấu hình GPU hiện tại. Chi tiết tại docs/windows-qa.md. Còn manual Save/Paint, DPI/4K và zoom/edge rộng hơn; chưa build installer.

## Bổ sung: Line, header grid và chụp toàn bộ màn hình (2026-09-11)

**Status: implemented; Tasks 48-53 done; Tasks 47 and 54 need hardware/manual review.** Task 47–54 bổ sung theo bốn yêu cầu mới; giữ nguyên evidence và các mục manual còn mở của Task 01–46. Phần này thay thế thiết kế chụp theo màn hình được chọn/con trỏ trước đây cho cả Full screen và Select region.

### Hiện trạng đã đối chiếu code
- Toolbar.tsx chưa có Line; model.ts chỉ có arrow/rectangle/circle và các công cụ khác. styles.css dùng flex-wrap: wrap cho toolbar nên nhóm hành động có thể rơi xuống hàng.
- main.ts resolveDisplay rồi captureDisplay một màn hình, overlay setBounds(display.bounds). SelectionOverlay.tsx quy đổi và clamp pointer trong bitmap màn hình đó. Phím tắt dùng màn hình dưới con trỏ; trang chủ dùng màn hình được chọn trong dropdown.

### Hành vi và quyết định thiết kế
1. Thêm nút Line vẽ đoạn thẳng hai đầu, không có đầu mũi tên. Hỗ trợ màu, độ dày, chọn, di chuyển, resize, xóa và xuất như annotation hiện có. Nét giữ độ dày theo pixel ảnh khi resize; click không kéo không tạo đối tượng. Preview, hit-test, bounds và Copy/Save phải thống nhất, kể cả sau xoay toàn ảnh.
2. Header dùng CSS grid hai cột bằng nhau: repeat(2, minmax(0, 1fr)). Nửa trái chứa công cụ/thuộc tính đối tượng; nửa phải chứa Copy, Save, Cancel, căn phải. Hai nhóm luôn cùng hàng. Nhóm trái min-width: 0 và cuộn ngang khi thiếu chỗ, không làm rộng cửa sổ; hành động không co hoặc wrap. Kiểm chứng tại minWidth hiện tại 640 px và rộng hơn; nếu nhóm phải thiếu chỗ thì dùng nút icon có accessible label/tooltip ở breakpoint phù hợp. Tab/focus phải đưa công cụ đang focus vào vùng nhìn thấy.
3. Bỏ dropdown chọn màn hình trên home và thông báo phụ thuộc màn được chọn. Full screen chụp tất cả màn hình hiện có, ghép thành một ảnh và mở editor. Select region cho phép một lần nhấn–kéo–thả từ màn bất kỳ sang màn khác, gồm 3 màn trở lên. Home, phím tắt và tray dùng cùng hành vi; bỏ menu tray chọn riêng từng màn và câu mô tả chụp màn dưới con trỏ.
4. Ghép theo vị trí màn hình trong Windows (virtual desktop), không tự xếp thành một hàng: hỗ trợ tọa độ âm, bố trí trên/dưới, lệch mép, màn dọc. Chuẩn hóa origin về góc trái trên của union. Khoảng trống không có màn hình được để trong suốt; vùng chỉ chứa khoảng trống không hoàn tất crop.
5. Dùng DIP toàn desktop cho selection; mỗi màn giữ bounds, scaleFactor và kích thước bitmap thực. Đề xuất mật độ ảnh đầu ra chung bằng scaleFactor lớn nhất của các màn tham gia để tránh hạ độ phân giải màn DPI cao; màn DPI thấp được resample. Single-display giữ độ phân giải gốc. Tính chung các cạnh làm tròn để không hở/chồng seam. Chốt quy tắc qua Task 47 trước khi nối luồng; không giả định một tỷ lệ client-to-pixel cho các overlay mixed DPI.
6. Chụp các màn trước khi hiện overlay để không tự chụp lớp phủ; ghép/crop giữ trong RAM. Với region, ưu tiên chỉ tạo bitmap cuối cho vùng được chọn để giảm RAM. Đặt và kiểm chứng giới hạn cạnh/pixel/tổng buffer trước khi cấp phát, đồng bộ với validator xuất ảnh; vượt giới hạn phải báo lỗi rõ ràng, không âm thầm bỏ màn hoặc giảm chất lượng.
7. Spike xác minh một overlay phủ union và pointer capture trên Windows mixed DPI. Nếu không giữ đúng pointer/hiển thị, dùng overlay từng màn phối hợp qua một session và tọa độ desktop chung, có theo dõi pointer/release xuyên cửa sổ được kiểm chứng. Không dùng các selection độc lập theo màn. IPC chỉ mở các thông điệp capture cần thiết, kiểm tra sender/session/bounds; Esc, mất pointer, hủy, lỗi một màn hoặc đổi cấu hình màn hình phải dọn toàn bộ phiên.

### Thứ tự triển khai và nghiệm thu
47 (spike nhiều màn) → 48 (geometry ghép) → 49 (capture/selection tích hợp) → 50 (home/tray); 51 (Line geometry) → 52 (Line UI); 53 (header grid sau khi thêm Line) → 54 (QA tổng hợp). Checklist chi tiết trong todo.md.

Rủi ro chính: mixed DPI gây lệch seam/pointer; union lớn tăng RAM; release ngoài cửa sổ bị mất; hotplug tạo dữ liệu phiên cũ. Dùng fixture màu theo màn, geometry unit tests và kiểm chứng desktop thật. Các màn được lấy frame riêng nên không cam kết đồng bộ tuyệt đối với nội dung đang chuyển động. Không log/upload pixel hoặc lưu capture tạm. Không đánh dấu QA nhiều màn thật đạt chỉ dựa trên mock.


### Implementation results for Tasks 47-54 (2026-09-11)

All four requested changes are implemented. Line uses the annotation rendering/editing/export pipeline; the header uses equal grid columns; home/tray/hotkeys capture the entire desktop; per-display frozen overlays share one main-process selection owner and native DIP cursor sampler. Gaps remain transparent. Output uses the highest display scale. Removed obsolete display targeting/list/subscription IPC. Nearest-center handle selection fixes overlapping targets at desktop-fit zoom.

Limits: 32 million pixels for both the composite and aggregate source frames, and 16384 pixels per output edge. One 32 MP BGRA surface is 128 MB, not a hard process RAM limit. Region currently composites before selection instead of delaying composition until crop, so an oversized desktop reports an error even for a small desired crop. The native-input E2E serves as the spike instead of a separate spike script.

Validation: production build/typecheck, 130 unit tests, 23 E2E passed. Native drag works both directions across two scale-1 physical monitors with a negative origin. Three mixed-DPI monitors were tested with synthetic fixtures; physical 3+ monitor/mixed-DPI/4K and native Save/Paint checks remain open. Synthetic 640 px header and Line editor screenshots were visually reviewed. See docs/windows-qa.md for evidence and limitations. No installer or version bump.


## Follow-up: two-row header and output feedback (2026-09-11)

Status: done (Task 55). User explicitly replaced horizontal scrolling and equal columns. Left tools now have two fixed rows; Copy/Save/Cancel at right use icons with tooltips and accessible labels. Successful output feedback is green, bold and larger at bottom right, with a tinted background; no toast needed. This supersedes Task 53's scrolling/equal-column design. Build/typecheck, 130 unit tests and three focused final E2E passed. Screenshots and evidence: docs/windows-qa.md. Earlier hardware/manual checks remain open.
