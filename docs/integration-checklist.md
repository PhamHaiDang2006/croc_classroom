# Checklist tích hợp nhóm

Chưa có mục nào được kiểm chứng. Chỉ đánh dấu khi có bằng chứng trong bàn giao/PR.
Mỗi lần chạy ghi commit, môi trường, lệnh hoặc bước thực hiện, kết quả và lỗi.

## M0 — Nền chung

- [ ] Workspace và lệnh dev/build/typecheck/test được ghi chính xác trong README.
- [ ] Hợp đồng v1 REST, WS, IPC, engine và worker có định nghĩa cụ thể, bên sử dụng đã review.
- [ ] Fixture và mock dùng chung đúng hợp đồng; renderer không import phụ thuộc Node.js.
- [ ] CI kiểm tra được khung dự án.
- [ ] Croc gửi/nhận qua relay cục bộ; kiểm tra cổng relay từ mạng trường và ghi kết quả thật.

## M1 — Tài khoản

- [ ] Nhập CSV, kích hoạt, đăng nhập/đăng xuất qua UI → IPC → server thật.
- [ ] SV không gọi được chức năng GV; tài khoản bị vô hiệu hoá bị thu hồi phiên.
- [ ] Lỗi xác thực/mạng hiển thị đúng; token không lộ ra log hoặc renderer ngoài nhu cầu.

## M2 — Giao và nhận đề

- [ ] GV gửi đề thật; code chỉ dùng sau khi VPS xác minh đầy đủ.
- [ ] SV join/fetch, nhận từ VPS và xác minh manifest; cache tách bản làm bài.
- [ ] Sai hash, file thiếu/thừa, timeout và huỷ được xử lý, không sót tiến trình.
- [ ] Tải lên lỗi có thể xin lại vé; reconnect lấy được trạng thái thực tế.

## M3 — Nộp và thu

- [ ] Nộp đúng/trễ hạn, vượt dung lượng và nộp lại; biên nhận dựa trên xác minh VPS.
- [ ] Bản mới lỗi không làm mất bản cũ; nộp đồng thời tuân thủ quy tắc version đã chốt.
- [ ] SV không xem/tải bài của người khác.
- [ ] GV mở lại app thu đúng bản mới nhất; xác nhận đã tải gắn với đúng version.
- [ ] Mất kết nối sau nộp vẫn truy vấn lại được biên nhận.

## M4 — Chia sẻ lại và phục hồi

- [ ] Test thuật toán chọn nguồn bằng fixture: LAN, CGNAT, VPS đầy, nguồn bị loại, hàng đợi.
- [ ] Thử hai máy LAN thật; ghi bằng chứng đường truyền, không chỉ quyết định chọn nguồn.
- [ ] Seeder tắt, không accept, sai hash: xử lý theo chính sách đã chốt và thử nguồn khác.
- [ ] Yêu cầu đồng thời không vượt giới hạn slot; huỷ/timeout giải phóng đúng một lần.
- [ ] Server restart, WS reconnect và kết quả trùng không làm vé/hàng đợi treo vô hạn.
- [ ] Xoá bài dừng chia sẻ, huỷ lượt liên quan và dọn dữ liệu theo hợp đồng.

## M5 — Đóng gói và chạy thực tế

- [ ] Windows, macOS x64/arm64, Linux: ghi rõ build nào đã chạy trên máy thật.
- [ ] File tiếng Việt và quy tắc đường dẫn đa nền tảng được kiểm chứng.
- [ ] GV tắt app, SV vẫn nhận và nộp được.
- [ ] Deploy, backup và khôi phục thử thành công với dữ liệu mẫu.
- [ ] Thử nhóm trong lớp và ở nhà; ghi thời gian phát đề, tỉ lệ LAN và tài nguyên VPS.
- [ ] So sánh với tiêu chí hiệu năng nhóm đã chốt; ghi lỗi và người phụ trách.
