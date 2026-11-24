# Bàn giao B trên A-Frontend — 24/11/2026

Bản này triển khai phạm vi desktop của B trực tiếp trên nền hợp đồng v1 đang có trong A-Frontend. Nhánh B_DesktopTransfer được đối chiếu ở commit 66bf1de. Các định nghĩa IPC, REST, WebSocket, manifest và CrocEngine giữ nguyên để A và D cùng sử dụng.

| Thành phần | Hành vi có thể kiểm tra |
|---|---|
| Main và preload | Mở ứng dụng Electron một phiên, thu xuống khay khi đang chia sẻ, gọi REST đã kiểm schema, dùng safeStorage khi hệ điều hành hỗ trợ. Renderer chỉ có invoke và on. |
| File | Chọn qua dialog, giữ selectionId trong main, tính và kiểm manifest bằng shared/node. Bản làm bài tách khỏi cache. Thư mục bài thu được thay sau khi xác minh bản mới. |
| Truyền | Gửi/nhận bằng croc 10.7.0, mã ngẫu nhiên 160 bit, timeout, huỷ, progress, phân loại lỗi, giới hạn dung lượng nhận. Có tác vụ tải đề, nhận đề, nộp và thu. Lượt nộp thành công cần biên nhận của đúng vé. |
| Chia sẻ | WS có xác thực, hello, heartbeat, reconnect, thông báo cache, phục vụ theo slot, xử lý vé hàng đợi và huỷ. Cache được xác minh khi khôi phục và trước khi phát. |
| Bộ cài | Script chọn binary theo nền tảng, kiểm SHA-256 đã ghim, đóng cùng giấy phép MIT. Bộ cài Windows NSIS đã build. Có cấu hình DMG x64/arm64 và AppImage x64. |

## Kiểm chứng trên Windows x64

| Kịch bản | Kết quả và phạm vi |
|---|---|
| `npm run check` | Lint, typecheck, build thành công. Vitest 289 đạt, 3 skip. |
| Test relay trong croc-engine | Hai tiến trình croc qua relay 10.7.0 cục bộ, file tiếng Việt trong thư mục lồng nhau, kiểm đường dẫn và nội dung. Nhận lần hai hết hạn, huỷ lặp kết thúc. |
| Test phần desktop | File thật trên đĩa cho chọn file, cache, bản làm việc và thay phiên bản. Test biên nhận dùng REST giả và engine loopback. Test seeder dùng kết nối WebSocket thật đến server kiểm thử và engine loopback. |
| `npm run package -w apps/desktop` | Tạo NSIS chưa ký. Bản ứng dụng đóng gói khởi động, preload kiểm dữ liệu sai, đăng nhập giảng viên vào server/SQLite cục bộ, đọc danh sách sinh viên và đăng xuất. |
| Binary đa nền tảng | Đã tải và kiểm hash đủ Windows x64, Linux x64, macOS x64 và arm64. Chỉ thực thi trên Windows. |

[Cách chạy](../../apps/desktop/README.md). Để lặp lại kiểm tra IPC, build toàn workspace rồi chạy `node scripts/smoke.mjs` từ apps/desktop. Đặt CLASSROOM_SMOKE_EXECUTABLE thành đường dẫn file thực thi đã đóng gói để thử bản đó. Test tạo profile và DB riêng.

## Việc còn lại khi nhóm cho phép tích hợp

- A/B/D chạy với dịch vụ vé, WebSocket và VPS worker thật. Kiểm tra GV phát hành, SV nhận và nộp, GV thu đúng phiên bản, seeder mất kết nối và chuyển nguồn. Server trên nhánh này có phần giả/placeholder, nên chưa nghiệm thu E2E nhiều máy.
- B và người có máy đích build, cài và thực hiện gửi/nhận trên Linux và hai kiến trúc macOS. Windows đã thử ứng dụng đóng gói, chưa thử toàn bộ trải nghiệm cài/gỡ trên máy sạch.
- A review IPC, D review engine v1. Bản bàn giao này không thay cho xác nhận review hợp đồng của các bên.
