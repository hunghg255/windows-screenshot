# Implementation Plan: GitHub Release cho bộ cài Windows

## Status: needs review — Windows x64 only

Implementation complete locally. Typecheck, production build and actionlint 1.7.12 passed; 48 unit tests (25 release tests), 7 desktop E2E tests passed. NSIS packaging with --publish never passed. Installer Screenshot-Setup-0.1.0-windows-x64.exe: 114778893 bytes; SHA256 630b1763b82bb1b579bde6d1408c0b39f8fa4f89d2642a94a2dde7ae1a04ce67.

Live GitHub Actions run, hosted Node 22 dependency installation, real release/download, anonymous access, and manual installer wizard install/uninstall remain unverified. No commit, tag push or publication was performed. Remote now exists: hunghg255/windows-screenshot. Local build includes concurrent working-tree changes.

Publisher implemented as scripts/publish-release.cjs with direct Vitest coverage instead of optional PowerShell helper.

## Overview
Khi maintainer push tag phiên bản lên GitHub, workflow tự kiểm tra, build bộ cài NSIS Windows x64 và xuất bản GitHub Release có file `.exe`. Người dùng mở Releases, tải bộ cài rồi cài ứng dụng mà không cần Node.js hoặc source code. Workflow đã triển khai; chưa push tag hoặc xác minh release thật.

## Hiện trạng đã kiểm tra
- `package.json`: version `0.1.0`, pnpm `8.15.9`, Node `>=22.12.0`; đã có typecheck, unit test, build và dist.
- `electron-builder.yml`: productName `Screenshot`, NSIS x64, output thực tế `release/windows-x64/`, cho chọn thư mục cài và tạo desktop shortcut, `signExecutable: false`.
- `scripts/install-electron.cjs` cài Electron đã pin, kiểm checksum và giải nén trên Windows; cần chạy postinstall trong CI.
- Chưa có `.github/` và chưa cấu hình Git remote trong checkout này. Không suy đoán owner/repo; workflow dùng repository context.
- README hiện ghi public distribution ngoài MVP; cần sửa khi triển khai. Có thay đổi đang làm trong working tree; giữ nguyên chúng và plan `windows-screenshot`.

## Architecture Decisions
1. Trigger `push.tags: ['v*']`; validate nghiêm ngặt tag `vMAJOR.MINOR.PATCH` hoặc prerelease SemVer như `v0.2.0-beta.1`. Không nhận build metadata trong đợt đầu. Bỏ tiền tố `v` rồi so sánh chính xác với `package.json.version`; sai thì fail trước khi cài dependencies. Push branch không phát hành. Tag phải trỏ tới commit chứa workflow và version đã cập nhật.
2. Dùng runner `windows-2022` x64, Node 22 với patch >=22.12 và pnpm 8.15.9. Checkout đúng commit của tag; setup pnpm trước bước setup-node có cache pnpm; `pnpm install --frozen-lockfile`, không bỏ lifecycle scripts. Chốt và pin các action vào commit SHA đã kiểm tra khi triển khai.
3. Build job quyền `contents: read`: chạy `pnpm typecheck`, `pnpm test`, `pnpm build`, sau đó `pnpm exec electron-builder --win nsis --x64 --publish never`. Tách packaging khỏi publishing để electron-builder không tự đăng release theo môi trường CI. Không sửa generated output bằng tay.
4. Đặt NSIS artifactName `Screenshot-Setup-${version}-windows-${arch}.${ext}`; chỉ chọn đúng installer tương ứng version, yêu cầu file tồn tại và khác rỗng. Tạo `SHA256SUMS.txt` và chuyển đúng hai file qua Actions artifact. Không upload toàn bộ thư mục release, `win-unpacked`, capture, hoặc source ZIP làm bộ cài.
5. Publish job chạy sau build thành công, quyền `contents: write`, dùng GitHub CLI với `GH_TOKEN` từ `github.token`; không cần PAT. Repository lấy từ `github.repository`; tag đi qua biến môi trường và được quote, không nội suy tag trực tiếp vào shell code. Mỗi lệnh native phải kiểm exit code.
6. Với tag mới: tạo draft bằng `gh release create --verify-tag --draft --generate-notes`, upload installer/checksum, kiểm tra đủ assets rồi chuyển sang published. Tag prerelease được đánh dấu prerelease và không đặt Latest; stable để GitHub quyết định Latest theo cơ chế mặc định. Không để release công khai thiếu bộ cài nếu upload lỗi.
7. Concurrency theo workflow + tag, không hủy publication đang chạy. Rerun có thể tiếp tục draft của cùng tag; chỉ thay assets trong draft. Release đã published và đủ assets thì no-op; published nhưng thiếu assets thì fail rõ để maintainer xử lý, không tự xóa hoặc thay binary đã phát hành. Phân biệt HTTP 404 với lỗi quyền/mạng, không coi mọi lỗi lookup là release chưa tồn tại.
8. Giữ bộ cài unsigned như cấu hình hiện tại; ghi rõ trong README/release notes. Code signing, auto-update trong app, ARM64, macOS/Linux, Store và portable không thuộc phạm vi này.
9. Unit tests và typecheck là CI gate. Playwright/native capture phụ thuộc desktop Windows tương tác, không mặc định coi hosted runner có điều kiện đó. Chạy `pnpm test:e2e` trên desktop phù hợp và smoke test bản cài tải từ release trước khi kết luận tích hợp đã được xác minh.

## Dependency Graph
Task 1 (artifact) -> Task 2 (tag build) -> Task 3 (publish) -> Task 4 (hướng dẫn và xác minh).
Các task dùng chung workflow nên thực hiện tuần tự; không cần chia agent.

## Task List
- [ ] Task 1 (needs review): Chuẩn hóa bộ cài và tên artifact.
- [ ] Task 2 (needs review): Build và kiểm tra khi push tag.
- [ ] Checkpoint: Installer và build gate hoạt động.
- [ ] Task 3 (needs review): Xuất bản GitHub Release sau build thành công.
- [ ] Task 4 (needs review): Hướng dẫn phát hành, tải và cài đặt; xác minh end-to-end.
- [ ] Checkpoint: Release tải được và bộ cài hoạt động.

Checklist chi tiết: [todo.md](todo.md).

## Risks and Mitigations
| Rủi ro | Tác động | Giảm thiểu |
|---|---|---|
| Tag lệch version ứng dụng | Cao | Fail sớm; maintainer bump version, commit rồi mới tag. |
| Download Electron/NSIS hoặc postinstall lỗi ở CI | Cao | Kiểm build trên Windows runner sớm; frozen lockfile và log rõ lỗi. |
| Upload lỗi để lại release thiếu asset | Cao | Draft trước, kiểm assets rồi publish; resume draft khi rerun. |
| Bộ cài unsigned có thể bị Windows cảnh báo | Trung bình | Nêu đúng trạng thái; signing là hạng mục riêng, không hứa không có cảnh báo. |
| Repo private hoặc token bị policy chặn | Cao | Repo cần public nếu muốn mọi người tải; kiểm Actions và quyền contents write. Không tự đổi visibility. |
| Native GUI không kiểm được trên CI | Trung bình | Manual smoke test bản cài và E2E trên Windows desktop; lưu trạng thái chưa xác minh nếu thiếu máy. |

## Verification Strategy
- Kiểm YAML bằng actionlint khi triển khai; xác minh action SHA, path và shell Windows.
- Local: typecheck, unit tests, build, packaging và checksum. Chạy focused tests cho validator tag nếu tách thành helper.
- GitHub: tag hợp lệ tạo release; tag sai/mismatch fail; branch push không chạy; build fail không publish; retry draft phục hồi; rerun published không thay binary.
- Tải `.exe` từ GitHub trên Windows x64, so checksum, cài, mở app/tray, chụp và copy/save, gỡ cài đặt. Nếu repo public, kiểm trang tải ở trạng thái chưa đăng nhập.
- Chỉ tạo/push tag kiểm thử khi có repo đích và yêu cầu triển khai/phát hành; phiên lập kế hoạch này không thay đổi GitHub.

## Open Questions / Assumptions
- Mặc định tag bắt đầu bằng `v`, hỗ trợ stable và prerelease như trên; Windows x64 unsigned.
- Repo GitHub đích chưa được cấu hình; không cản viết workflow dùng context, nhưng cần trước live verification.
- Không có quyết định sản phẩm nào đang chặn kế hoạch; người dùng review plan trước bước triển khai.

## Tài liệu tham khảo
- [GitHub workflow syntax: tags và permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [electron-builder publishing và --publish never](https://www.electron.build/publish/)
- [electron-builder NSIS configuration](https://www.electron.build/v26/docs/nsis/)
- [gh release create: draft, notes, verify-tag và prerelease](https://cli.github.com/manual/gh_release_create)
- [gh release upload](https://cli.github.com/manual/gh_release_upload) và [gh release edit](https://cli.github.com/manual/gh_release_edit)

## Scope decision
Windows x64 only. The user cancelled the planned x32 extension; Tasks 5–9 were removed before implementation. Keep the current Electron version; no runtime downgrade is planned.
