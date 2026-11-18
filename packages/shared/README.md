# packages/shared

Code dùng chung giữa app desktop và server: kiểu dữ liệu, hợp đồng REST/WebSocket/IPC, manifest, code phrase.
C quản lý; thay đổi hợp đồng theo quy trình trong [contracts.md](../../docs/contracts.md).

Thiết kế: mục 6, 8, 9, 10 và 13 trong [system-design.md](../../docs/system-design.md).

## Các điểm vào

| Import | Dùng ở | Nội dung |
|---|---|---|
| `@croc-classroom/shared` | renderer, main, server | Schema zod, kiểu, hằng số, `endpoints` (REST), WS, IPC, kiểm tra manifest thuần |
| `@croc-classroom/shared/node` | main, server | Tính / xác minh manifest trên đĩa, mã băm tổng, sinh code phrase |
| `@croc-classroom/shared/fixtures` | test, mock | Dữ liệu mẫu đúng hợp đồng |
| `@croc-classroom/shared/mocks` | renderer (khi chưa có main) | `createMockCrocApi()` — `window.croc` giả trong bộ nhớ |

Phần dùng cho renderer không được import module Node.js; ESLint chặn.

## Việc cần làm

- [x] Khởi tạo package TypeScript trong workspace.
- [x] Kiểu dữ liệu: `User`, `Student`, `Assignment` (GV/SV), `Ticket` (các loại `gv_tai_len`, `phat_de`, `nop_bai`, `gv_thu_bai`), `Submission`, `Receipt`.
- [x] Hợp đồng REST theo mục 10, kèm schema kiểm tra đầu vào dùng chung cho cả hai phía (zod — D-001). *Chờ B, D review.*
- [x] Hợp đồng WebSocket gồm các thông điệp của mục 10 và phần bổ sung trong D-003. *Chờ D, B, C review.*
- [x] Hợp đồng IPC (`window.croc`). *Chờ B, A review.*
- [x] **Manifest**:
  - [x] Định dạng gồm đường dẫn tương đối, kích thước và SHA-256 của từng file.
  - [x] Hàm tính manifest cho một thư mục, đọc file theo dạng stream để không nạp cả file lớn vào bộ nhớ.
  - [x] Hàm xác minh một thư mục theo manifest: thiếu file, thừa file, sai kích thước, sai hash, symlink.
  - [x] Chuẩn hoá đường dẫn: dùng dấu `/`, chuẩn Unicode **NFC**; chặn `..`, đường dẫn tuyệt đối, tên không hợp lệ trên Windows, trùng hoa/thường.
  - [x] Mã băm tổng của manifest, dùng trong biên nhận nộp bài.
- [x] **Code phrase**: 128 từ, `tu-tu-tu-NNN` ≈ 31 bit, chữ thường, không phân biệt hoa thường khi so sánh.
- [ ] **Code croc**: đề xuất chuyển sang `CrocEngine.generateCode()` của croc-engine (D-006), chờ B.
- [x] Hằng số giới hạn mặc định (mục 13); server ghi đè bằng biến `LIMIT_*`.
- [x] Unit test cho manifest (gồm tên file tiếng Việt dạng NFD lấy từ macOS) và cho code phrase.
- [ ] Chạy test manifest trên Windows và macOS thật (mới chạy trên Linux).
