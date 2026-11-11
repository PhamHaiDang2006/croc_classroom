# packages/shared

Code dùng chung giữa app desktop và server: kiểu dữ liệu, hợp đồng API và WebSocket, manifest, code phrase.

Thiết kế: mục 6, 8, 9, 10 và 13 trong [system-design.md](../../docs/system-design.md).

## Việc cần làm

- [ ] Khởi tạo package TypeScript trong workspace.
- [ ] Kiểu dữ liệu: `User`, `Assignment`, `Participant`, `Ticket` (các loại `gv_tai_len`, `phat_de`, `nop_bai`, `gv_thu_bai`), `Submission`, `Receipt`.
- [ ] Hợp đồng REST theo mục 10, kèm schema kiểm tra đầu vào dùng chung cho cả hai phía (thư viện do builder chọn).
- [ ] Hợp đồng WebSocket gồm các thông điệp:
  - `hello`, `seed.announce`, `seed.withdraw`
  - `serve.request`, `serve.accept`, `serve.reject`, `serve.result`
  - `ticket.ready`, `ticket.cancel`, `submission.new`
- [ ] **Manifest**:
  - [ ] Định dạng gồm đường dẫn tương đối, kích thước và SHA-256 của từng file.
  - [ ] Hàm tính manifest cho một thư mục, đọc file theo dạng stream để không nạp cả file lớn vào bộ nhớ.
  - [ ] Hàm xác minh một thư mục theo manifest: thiếu file, thừa file, sai kích thước, sai hash.
  - [ ] Chuẩn hoá đường dẫn: dùng dấu `/`, chuẩn Unicode **NFC**; chặn `..` và đường dẫn tuyệt đối.
  - [ ] Mã băm tổng của manifest, dùng trong biên nhận nộp bài.
- [ ] **Code phrase**: danh sách từ dễ đọc, ít nhất khoảng 30 bit ngẫu nhiên, chữ thường, không phân biệt hoa thường khi so sánh.
- [ ] **Code croc**: chuỗi ngẫu nhiên ít nhất 128 bit, sinh bằng bộ sinh số ngẫu nhiên an toàn cho mật mã.
- [ ] Hằng số giới hạn mặc định (mục 13), cho phép ghi đè bằng cấu hình.
- [ ] Unit test cho manifest (gồm tên file tiếng Việt dạng NFD lấy từ macOS) và cho code phrase.
