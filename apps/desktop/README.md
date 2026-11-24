# Croc Classroom Desktop

Ứng dụng Electron dùng chung cho giảng viên và sinh viên. Renderer gọi preload qua IPC v1. Main quản lý phiên, REST, WebSocket, file và tiến trình croc.

## Chạy từ gốc repository

Dùng Node theo engines của workspace. Sau khi cài dependency, tải croc và build trước khi mở Electron.

```sh
npm ci
node packages/croc-engine/scripts/download.mjs
npm run build
npm start -w apps/desktop
```

Nếu môi trường npm chưa tải Electron sau khi cài dependency, chạy `npx --no-install install-electron`. Server chạy riêng. Dùng HTTPS với máy chủ từ xa, hoặc HTTP qua localhost để thử trên cùng máy. Phiên thật cần endpoint đăng nhập và cấu hình. Chức năng truyền file của lớp học cần thêm dịch vụ vé, WebSocket, worker và relay.

Để phát triển riêng giao diện, dùng `npm run dev -w apps/desktop`. Vite preview dùng mock. Xem [bàn giao B](../../docs/handoffs/B.md) để biết phạm vi đã kiểm chứng.

## Đóng gói và cài thử

Chạy `npm run package -w apps/desktop` trên hệ điều hành đích. Trên macOS, dùng thêm `-- x64` hoặc `-- arm64` để chọn kiến trúc. Kết quả nằm trong `apps/desktop/dist/installers`. Binary croc được kiểm SHA-256 và đặt trong resources bên cạnh giấy phép MIT.

- Windows x64 tạo bộ cài NSIS. Với bản nội bộ chưa ký, kiểm tra nguồn gốc và checksum do nhóm phát hành cung cấp trước khi chọn **More info → Run anyway** nếu Windows cho phép.
- macOS tạo DMG. Kéo ứng dụng vào Applications. Nếu Gatekeeper chặn bản nội bộ đã xác minh, dùng mục Privacy & Security của macOS để cho phép riêng ứng dụng.
- Linux x64 tạo AppImage. Cấp quyền thực thi cho file rồi mở trên máy hỗ trợ AppImage.
