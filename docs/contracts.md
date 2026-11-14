# Hợp đồng giao tiếp — danh mục cần chốt ở M0

**Trạng thái: chưa có hợp đồng v1 được triển khai hoặc review.** File này là danh mục
công việc bootstrap, không thay thế schema thực thi. API trong system-design.md vẫn
là bản phác thảo. Không dùng tên ví dụ chưa chốt như một hợp đồng đã có.

## Nguồn sự thật sau bootstrap

- `packages/shared`: kiểu dữ liệu và schema kiểm tra tại runtime cho REST, WS, IPC.
- Interface engine do B quản lý; interface vé/worker do D đề xuất và C cùng review.
- File này ghi phiên bản hợp đồng, đường dẫn định nghĩa cụ thể, ví dụ và quy tắc ngữ nghĩa.
- Không duy trì hai bản schema thủ công khác nhau trong tài liệu và mã nguồn.

## Danh mục phải hoàn thành

| Nhóm | Nội dung bắt buộc | Đề xuất / review |
|---|---|---|
| REST | Method/path, quyền, request/response, HTTP status, mã lỗi, xử lý lặp | C / B, D |
| WebSocket | Xác thực, envelope/payload, correlation, heartbeat, reconnect, đồng bộ lại | D / B, C |
| IPC | Hàm và sự kiện có kiểu; unsubscribe; lỗi; dữ liệu được phép tới renderer | B / A |
| croc-engine | send/receive, tiến trình, done/error, cancel, timeout, quy ước payload | B / D |
| Vé và worker | Interface gọi nội bộ, trạng thái, bên có quyền chuyển trạng thái, kết quả xác minh | D / C, B |
| Dữ liệu | DTO, ID, UTC, version bài nộp, trạng thái bài/vé, schema lỗi thống nhất | C / A, B, D |
| Manifest | Đường dẫn chuẩn, thứ tự/canonicalization để hash tổng, file thừa/thiếu, symlink | B, C / D |

## Những chỗ phải làm rõ trước khi triển khai phụ thuộc

- Xin lại vé tải đề lên, truy vấn trạng thái bài phát hành và nhận biên nhận sau mất kết nối.
- Báo bài đã phát hành/bị xoá; huỷ vé và dọn cache khi bài bị xoá.
- Xác nhận GV thu đúng version; xử lý hai lần nộp đồng thời và kết quả đến không theo thứ tự.
- Nguồn xác nhận thành công cho từng loại vé; không dùng báo cáo client để xác nhận VPS đã lưu file.
- Giải phóng slot đúng một lần, chống xử lý kết quả lặp và phục hồi sau restart.
- Không cấm nguồn chỉ dựa trên cáo buộc sai hash chưa được xác minh: cần chốt chính sách
  thay cho quy tắc cấm trực tiếp trong thiết kế ban đầu trước khi triển khai phần này.
- Chính sách tên file khác hoa/thường, tên không hợp lệ, symlink và giới hạn số file.
- Cách đổi mật khẩu relay và giới hạn thu hồi quyền khi client từng nhận mật khẩu chung.
- Tiêu chí đo được cho hiệu năng và thử LAN thật; mô phỏng subnet không chứng minh truyền LAN.

## Quy trình thay đổi

Đề xuất trong `handoffs/<vai-tro>-contract-requests.md`, ghi old/new, lý do, bên ảnh hưởng,
phương án tương thích/migration và test. C điều phối review; bên sử dụng phải biết thay đổi.
Merge hợp đồng vào nền chung trước, rồi cập nhật bên cung cấp và bên sử dụng.

Trong M0, bổ sung bảng phiên bản/ngày/PR và liên kết schema thực tế ở đây.
