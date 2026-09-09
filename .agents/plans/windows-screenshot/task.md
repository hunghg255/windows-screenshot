# Kế hoạch: Ứng dụng Windows Screenshot

Ngày lập/cập nhật: 2026-09-09. Baseline MVP đã triển khai và có installer; một số nghiệm thu thủ công còn mở. Bổ sung Text, Emoji và sửa chọn màn hình đã triển khai (Task 16–22). Status: needs review — build/typecheck, 48 unit tests, 8 desktop tests và 7 tests trên executable 0.2.0 đều đạt; nghiệm thu thủ công/phần cứng còn mở, xem docs/windows-qa.md.
Dự án đã có AGENTS.md, pnpm, build/test và implementation log. Kết quả baseline nằm tại docs/windows-qa.md và .agents/implements/implement-notes.html.
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


