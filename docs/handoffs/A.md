# Bàn giao A — nhánh frontend và sửa tích hợp C–D

- Ngày: 2026-11-21.
- Nhánh: `codex/frontend`, tạo từ `origin/D_role@7812ecd`, đã chứa `C/Backend@1e0ab59`.
- Người dùng giao trực tiếp sửa các vấn đề tích hợp C/D trên nhánh frontend.
- Chưa commit/push. Nhánh không tracking D_role để tránh push nhầm vào phần D.
- Chưa triển khai giao diện; đây là chuẩn bị nền cho frontend.

## Đã sửa

- Upload: kiểm đúng vé/bài/loại/hạn; cập nhật bài và vé trong transaction. Callback
  trả accepted/ref để D không phát hành nhầm hoặc xoá bản đã commit khi retry.
- Đồng bộ tạo/gia hạn/nộp/thu/xoá và callback bằng lock theo bài, chung Db/tiến trình.
- Migration 3: dấu `deleting` chặn truyền mới nếu purge lỗi hoặc server restart;
  bảng `payload_gc` giữ tham chiếu file cũ cho đến khi worker dọn an toàn.
- Vé thu được ghi trước khi mở khoá, giữ phiên bản đang dùng. Xác nhận thu phải khớp
  vé/version và hạn, kết thúc vé nguyên tử. Fake issuer không tự ghi thành công nữa.
- Dockerfile build từ gốc workspace, runtime user node UID/GID 1000; .dockerignore
  loại secret/dữ liệu cục bộ. Compose build context và hướng dẫn quyền volume/CLI đã sửa.
- CI gọi test cấu hình Compose và build image. Không tuyên bố CI remote đã chạy.
- Sửa fixture test chọn đúng vé theo bài. Test filesystem chạy được trên Windows,
  ghi skip rõ khi máy thiếu quyền symlink hoặc không thể tạo tên file không hợp lệ.

## Hợp đồng và giới hạn

- REST/WS/IPC giữ v1. Interface nội bộ C–D cập nhật trong `docs/contracts.md`.
- D cần dùng gate và helper cleanup chung, ghi vé trước khi trả từ issuer; không
  chờ callback hoặc lấy lại lock từ bên trong issuer khi C đang giữ lock.
- D cần triển khai worker, quét timeout, phục hồi dấu xoá/GC và dọn payload chưa commit.
  B cần engine croc thật. Image hiện chưa có engine/worker truyền file thực tế.
- Thay đổi đã được người dùng giao, nhưng chưa có review của các thành viên C/D/B.
- Docker daemon trên máy không hoạt động: chưa build/chạy container, chưa kiểm chứng
  VPS, HTTPS/WSS, LAN hoặc truyền file thật.

## Kiểm chứng

- Node 24.21.0, npm 11.19.0, Windows.
- `npm ci --ignore-scripts`: thành công, không thay lockfile.
- `node --test tests/e2e/deploy.test.mjs`: 3 test đạt (cấu hình, không chạy container).
- `npm run check`: lint, typecheck, test và build; kết quả cuối được cập nhật sau lượt chạy.
- Kiểm thử lifecycle dùng server/SQLite thật với issuer giả, không chứng minh croc hoạt động.

## Tiếp theo cho frontend

Đọc `packages/shared/src/ipc.ts`; dùng `createMockCrocApi()` từ
`@croc-classroom/shared/mocks` khi B chưa có main/preload. Không gọi Node hoặc
backend trực tiếp từ renderer. Backend có thể dùng chế độ vé giả để thử UI cục bộ,
nhưng không coi biên nhận giả là đã nhận file thật và không bật chế độ này trên VPS.
