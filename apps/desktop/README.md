# apps/desktop

App Electron dùng chung cho **giảng viên** và **sinh viên**. Sau khi đăng nhập, app hiện giao diện theo vai trò.

Thiết kế: mục 5, 7, 8 (phần Electron) và 11 trong [system-design.md](../../docs/system-design.md).

## Các phần

| Thư mục | Việc |
|---|---|
| [`src/main`](src/main/README.md) | Tiến trình chính: API client, WebSocket, croc, seeder, cache chia sẻ, cài đặt |
| [`src/preload`](src/preload/README.md) | Cầu IPC an toàn |
| [`src/renderer`](src/renderer/README.md) | Giao diện React |

## Trạng thái frontend (2026-11-22)

Đã có React renderer và Vite preview, dùng hợp đồng IPC hiện có. Chạy từ gốc:
`npm run dev -w @croc-classroom/desktop`, mở `http://127.0.0.1:5173`.
Xem [hướng dẫn frontend](../../docs/frontend.md) cho vai trò, tài khoản mẫu, build và kiểm thử.
Production dùng `window.croc`; dev có mock với banner rõ ràng. Electron main/preload
và croc engine thật vẫn chưa có, không coi preview là ứng dụng truyền file hoàn chỉnh.

## Baseline sau M0 bootstrap

Mới có `package.json` khai báo gói trong workspace (phụ thuộc `shared`, `croc-engine`); **chưa có
Electron**. B dựng khung electron-vite + React (D-001 để B chọn công cụ desktop).

- Hợp đồng IPC (`window.croc`): `packages/shared/src/ipc.ts` — chờ B, A review.
- A làm giao diện trước bằng `createMockCrocApi()` từ `@croc-classroom/shared/mocks`.
- ESLint đã chặn `src/renderer/**` import `electron`, croc-engine, `shared/node` và module Node.js.

## Việc cần làm (khung app và đóng gói)

- [ ] Khởi tạo electron-vite + React + TypeScript trong workspace; dùng [`packages/shared`](../../packages/shared/README.md) và [`packages/croc-engine`](../../packages/croc-engine/README.md).
- [ ] Đặt địa chỉ server mặc định lúc build; màn hình đăng nhập vẫn cho sửa.
- [ ] Chỉ cho chạy một bản app cùng lúc (single instance lock).
- [ ] Biểu tượng ở khay hệ thống: khi đang chia sẻ mà đóng cửa sổ thì app thu xuống khay thay vì thoát.
- [ ] electron-builder:
  - [ ] Windows: bộ cài NSIS.
  - [ ] macOS: dmg cho x64 và arm64 (phải build trên máy Mac).
  - [ ] Linux: AppImage.
  - [ ] Đóng gói file chạy croc 10.7.0 đúng nền tảng.
- [ ] Kèm thông báo giấy phép của croc (MIT) trong bộ cài.
- [ ] Viết hướng dẫn cài đặt khi bộ cài chưa ký số (cảnh báo SmartScreen và Gatekeeper).
- [ ] Toàn bộ giao diện bằng tiếng Việt.
