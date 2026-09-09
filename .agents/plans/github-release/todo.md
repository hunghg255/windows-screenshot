# Tasks: GitHub Release Windows installer

**Status: needs review.** Windows x64 implementation complete; live/manual acceptance remains open.

Typecheck, production build and actionlint 1.7.12 passed; 48 unit tests (25 release tests), 7 desktop E2E tests passed. NSIS packaging with --publish never passed. Installer Screenshot-Setup-0.1.0-windows-x64.exe: 114778893 bytes; SHA256 630b1763b82bb1b579bde6d1408c0b39f8fa4f89d2642a94a2dde7ae1a04ce67.

Live GitHub Actions run, hosted Node 22 dependency installation, real release/download, anonymous access, and manual installer wizard install/uninstall remain unverified. No commit, tag push or publication was performed. Remote now exists: hunghg255/windows-screenshot. Local build includes concurrent working-tree changes.

## Task 1: Chuẩn hóa bộ cài và tên artifact
**Status:** needs review — implemented; live/manual verification pending.
**Description:** Giữ cấu hình NSIS hiện có, thêm tên file thể hiện version và Windows x64 để workflow chọn đúng bộ cài.

**Acceptance criteria:**
- [x] Packaging tạo `release/windows-x64/Screenshot-Setup-<version>-windows-x64.exe`, file khác rỗng.
- [x] Giữ luồng chọn thư mục cài, shortcut và cấu hình unsigned hiện có; không sửa generated output.
- [x] Packaging với `--publish never` hoàn tất mà không cần token GitHub.

**Verification:**
- [x] Chạy `pnpm typecheck`, `pnpm test`, `pnpm build`.
- [x] Chạy `pnpm exec electron-builder --win nsis --x64 --publish never`, đối chiếu version và tên file.
- [ ] Mở installer trên Windows x64 và kiểm tra wizard.

**Dependencies:** None

**Files likely touched:**
- `electron-builder.yml`

**Estimated scope:** Small: 1 file.

## Task 2: Build và kiểm tra khi push tag
**Status:** needs review — implemented; live/manual verification pending.
**Description:** Tạo build job trên Windows x64, validate tag/version trước dependency install, chạy kiểm tra và đóng gói, lưu installer cùng checksum làm artifact cho publish job.

**Acceptance criteria:**
- [x] Chỉ push `v*` kích hoạt; chấp nhận stable/prerelease hợp lệ khớp package version, từ chối tag malformed hoặc mismatch trước install.
- [x] Pin action SHA, Node 22 patch phù hợp, pnpm 8.15.9; frozen install chạy postinstall, typecheck/unit/build/packaging phải pass và lỗi native command phải làm job fail.
- [x] Chỉ chuyển installer đúng version và SHA256SUMS.txt qua artifact; thiếu/rỗng installer làm fail; build chỉ có contents read.

**Verification:**
- [x] Validate workflow bằng actionlint; test các tag `v0.1.0`, `v0.2.0-beta.1`, malformed, mismatch và branch ref qua validator tương ứng.
- [x] `pnpm typecheck`, `pnpm test`, `pnpm build` pass; đóng gói bằng lệnh Task 1.
- [ ] Run trên GitHub Windows runner khi có repo kiểm thử; so checksum artifact và đảm bảo job fail đúng khi validation/test thất bại.

**Dependencies:** Task 1

**Files likely touched:**
- `.github/workflows/release.yml`
- `scripts/validate-release-tag.cjs` (nếu cần helper để kiểm thử validator)
- `tests/release-tag.test.ts` (nếu tách helper)

**Estimated scope:** Medium: 1-3 files.

## Checkpoint: After Tasks 1-2
- [x] Unit tests và typecheck pass; bộ cài build được trên Windows.
- [x] Tag/version sai bị chặn và artifact đúng tên, đúng checksum.
- [x] Review kết quả trước phần publication; ghi rõ phần chưa thể kiểm nếu thiếu remote/runner.

## Task 3: Xuất bản GitHub Release
**Status:** needs review — implemented; live/manual verification pending.
**Description:** Thêm publish job phụ thuộc build; dùng GitHub CLI tạo draft, upload bộ cài/checksum và chỉ publish khi đầy đủ. Bảo đảm retry không thay file đã phát hành.

**Acceptance criteria:**
- [x] Publish job có contents write, dùng github.token và repository context; tạo release đúng existing tag, có generated notes và chỉ dẫn tải installer.
- [x] Stable thành release thường; beta/rc thành prerelease không Latest; công khai sau khi xác nhận đủ installer và checksum.
- [x] Concurrency theo tag; retry tiếp tục draft, published đủ assets no-op, published thiếu assets fail rõ; lỗi build/quyền/upload không dẫn tới release công khai mới thiếu file.

**Verification:**
- [x] actionlint pass; review needs, permissions, biến môi trường, exit code và chọn file upload.
- [ ] Trên repo kiểm thử: stable/prerelease, resume draft sau upload lỗi, rerun published, và lỗi token được xử lý đúng.
- [ ] Kiểm release URL và download lại installer/checksum, đối chiếu bản build. Không dùng Actions artifact link làm link tải chính cho người dùng.

**Dependencies:** Task 2

**Files likely touched:**
- `.github/workflows/release.yml`
- `scripts/publish-release.cjs`
- `tests/release-publish.test.ts`

**Estimated scope:** Small: 1-2 files.

## Task 4: Hướng dẫn và xác minh tải/cài đặt
**Status:** needs review — implemented; live/manual verification pending.
**Description:** Cập nhật README cho maintainer và người dùng, thay nội dung public distribution ngoài MVP, xác minh installer tải trực tiếp từ release.

**Acceptance criteria:**
- [x] README hướng dẫn bump version, commit, tạo tag khớp version rồi push một tag cụ thể; nêu cách xem Actions, retry và yêu cầu repo public để mọi người tải.
- [x] Hướng dẫn Releases -> Assets -> file Setup .exe, Windows x64, unsigned; phân biệt Source code ZIP với installer và nêu auto-update chưa thuộc phạm vi.
- [x] Lưu evidence release URL/run/version và kết quả tải, checksum, cài/mở/chụp/copy/save/gỡ; ghi rõ manual/E2E chưa chạy nếu thiếu môi trường.

**Verification:**
- [ ] Chạy `pnpm typecheck`, `pnpm test` và xác nhận build pass ở workflow cuối cùng.
- [x] Chạy build rồi `pnpm exec playwright test` trên Windows desktop: 7/7 pass.
- [ ] Tải file từ release trên Windows x64 không cần Node.js, so SHA256 và thực hiện smoke test; kiểm tải khi chưa đăng nhập nếu repo public.

**Dependencies:** Task 3

**Files likely touched:**
- `README.md`
- `docs/windows-qa.md`

**Estimated scope:** Small: 2 files.

## Checkpoint: Complete
- [ ] Tất cả acceptance criteria được xác minh, hoặc phần bị chặn được ghi rõ và không đánh dấu hoàn tất.
- [ ] Push tag dẫn tới release tải được installer, cài và chạy thành công.
- [x] Hướng dẫn khớp workflow; thay đổi sẵn sàng review.

## Verification limits
Checked publication criteria mean implemented and covered by mocked control-flow tests, not a live GitHub release. Live verification boxes stay open.

## Scope decision
Windows x64 only. The user cancelled the planned x32 extension; Tasks 5–9 were removed before implementation. Keep the current Electron version; no runtime downgrade is planned.
