# Bàn giao A — nhánh frontend và sửa tích hợp C–D

- Ngày: 2026-11-21.
- Nhánh tạo ban đầu: `codex/frontend`, từ `origin/D_role@7812ecd`, đã chứa `C/Backend@1e0ab59`.
- Kiểm tra ngày 2026-11-22: nhánh hiện tại là `A-Frontend`, commit `e882a28`, tracking
  `origin/A-Frontend`; các bản sửa bên dưới đã có trong commit này, working tree sạch trước cập nhật bàn giao.
- Người dùng giao trực tiếp sửa các vấn đề tích hợp C/D trên nhánh frontend.
- Việc commit/push trên được quan sát từ Git; agent không thực hiện commit/push trong lượt kiểm tra này.
- Bản ghi ban đầu là chuẩn bị nền. Ngày 2026-11-22 đã triển khai frontend React;
  xem phần cập nhật bên dưới và `docs/frontend.md`.

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
- `npm run check` trong lượt sửa trước: lint, typecheck, build đạt; 16 file test,
  283 test đạt, 3 skip. Hai skip vì Windows chưa cấp quyền symlink; một skip vì
  Windows không cho tạo fixture tên file chứa `?`. Chưa chạy lại ở lượt kiểm tra 2026-11-22.
- Kiểm thử lifecycle dùng server/SQLite thật với issuer giả, không chứng minh croc hoạt động.

## Tiếp theo cho frontend

### Cập nhật 2026-11-22 — frontend đã triển khai theo yêu cầu xây mới

- Renderer React/Vite: dashboard GV/SV, đăng nhập/kích hoạt, tạo/chọn/tìm bài,
  mã giao bài, xem file, chỉnh hạn, xác nhận xoá, nhập CSV/quản lý SV, cài đặt,
  nhận/nộp/biên nhận. Dùng schema/kiểu IPC hiện có, không đổi hợp đồng.
- Adapter ưu tiên `window.croc`; dev dùng mock với banner. Production không có
  preload thì báo chưa sẵn sàng, không tự dùng mock. Chưa có main/preload/engine thật.
- Thiết kế nền trung tính ấm, xanh lớp học, Be Vietnam Pro 400/500 đóng gói cục bộ,
  card 12–16px, nút 8px, không gradient/glow/animation tự chạy. Xem audit 20 tiêu chí
  trong `docs/frontend.md` và ảnh `docs/screenshots/frontend-*.png`.
- `npm run check`: đạt 283 test, 3 skip do filesystem Windows, lint/typecheck/build
  gồm renderer. `npm run test:ui -w @croc-classroom/desktop` với Edge: **7/7 đạt**.
  UI test kiểm tra cả lỗi truyền không có biên nhận, retry giữ selection, native
  bridge lỗi không chuyển mock và logout trên mobile. CI đã thêm test Chromium;
  chưa tuyên bố CI remote chạy hoặc có E2E truyền file thật.
- Đã xem ảnh desktop/mobile/student, kiểm tra không tràn ngang ở 390px.
  Không có ảnh before vì repo chưa có frontend trước yêu cầu xây mới.
- Chạy: `npm run dev -w @croc-classroom/desktop`, mở `http://127.0.0.1:5173`.
- File cấu hình gốc/lockfile được bổ sung để chạy phần A theo yêu cầu người dùng.
  Không sửa nghiệp vụ C/D, không commit/push trong lượt xây giao diện.

### Ghi nhận trước khi xây mới

Kiểm tra ngày 2026-11-22: chưa có landing page hoặc frontend thực thi để audit/chụp
ảnh. `apps/desktop/package.json` chưa có script dev/build giao diện; renderer mới có
README, không có HTML/TSX/JSX/CSS/SCSS của giao diện. Yêu cầu audit 20 dấu hiệu thiết
kế cần URL/branch chứa trang hoặc xác nhận xây dựng frontend mới. Không ghi “không
có lỗi thiết kế” khi chưa có trang để kiểm tra, không tạo ảnh before giả.

Đọc `packages/shared/src/ipc.ts`; dùng `createMockCrocApi()` từ
`@croc-classroom/shared/mocks` khi B chưa có main/preload. Không gọi Node hoặc
backend trực tiếp từ renderer. Backend có thể dùng chế độ vé giả để thử UI cục bộ,
nhưng không coi biên nhận giả là đã nhận file thật và không bật chế độ này trên VPS.
