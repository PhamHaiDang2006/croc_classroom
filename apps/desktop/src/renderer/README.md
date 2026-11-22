# apps/desktop/src/renderer

Giao diện React, viết bằng tiếng Việt. Giao diện chỉ gọi API do [`preload`](../preload/README.md) mở ra, không tự truy cập file hay mạng.

Thiết kế: mục 7 trong [system-design.md](../../../../docs/system-design.md).

## Bản giao diện đầu tiên

Đã có giao diện React chạy bằng Vite. Xem [hướng dẫn](../../../../docs/frontend.md).
`App.tsx` chứa các màn hình, `api.ts` chọn preload hoặc mock có chủ đích, `styles.css`
là bộ quy tắc giao diện. Kiểu dữ liệu lấy từ shared, không tự định nghĩa DTO.
Checklist dưới là phạm vi mục tiêu; kết quả test/giới hạn được ghi trong bàn giao A.

## Việc cần làm

**Màn hình chung**

- [ ] Đăng nhập (có ô sửa địa chỉ server).
- [ ] Kích hoạt tài khoản: MSSV, mã kích hoạt, mật khẩu mới.
- [ ] Cài đặt: các thư mục, bật/tắt chia sẻ lại, số lượt chia sẻ cùng lúc, xoá cache, đăng xuất.

**Sinh viên**

- [ ] Ô nhập code phrase.
- [ ] Danh sách bài đã tham gia: trạng thái nhận đề, đang chia sẻ, hạn nộp, đã nộp / trễ.
- [ ] Chi tiết bài:
  - [ ] Tiến trình nhận đề, kèm báo "đang xếp hàng" nếu phải chờ.
  - [ ] Nút mở thư mục làm bài.
  - [ ] Nộp bài: chọn file/thư mục, tiến trình gửi.
  - [ ] Biên nhận gồm giờ nộp và mã băm.

**Giảng viên**

- [ ] Danh sách bài tập.
- [ ] Tạo bài:
  - [ ] Nhập tiêu đề, mô tả, hạn nộp (tuỳ chọn), chọn file.
  - [ ] Tiến trình tải lên VPS.
  - [ ] Hiện **code phrase cỡ chữ lớn** cùng nút sao chép.
- [ ] Chi tiết bài:
  - [ ] Code phrase và thống kê.
  - [ ] Bảng sinh viên với trạng thái chưa nộp / đã nộp / trễ, giờ nộp, số lần nộp.
  - [ ] Nút mở thư mục bài nộp.
  - [ ] Sửa hạn nộp.
  - [ ] Xoá bài, có hộp thoại xác nhận.
- [ ] Sinh viên:
  - [ ] Nhập CSV, xem dòng lỗi.
  - [ ] Xuất danh sách mã kích hoạt.
  - [ ] Cấp lại mã kích hoạt.
  - [ ] Vô hiệu hoá tài khoản.

**Chung**

- [ ] Giờ hiển thị theo giờ máy; bài trễ hạn được tô màu.
- [ ] Thông báo lỗi dễ hiểu cho người dùng, ví dụ "Không kết nối được máy chủ" hay "Code không đúng".
