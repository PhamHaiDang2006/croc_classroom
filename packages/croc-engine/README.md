# packages/croc-engine

Bọc croc CLI. Đây là **nơi duy nhất** trong hệ thống chạy croc và đọc đầu ra của croc.
Được dùng bởi [`apps/desktop/src/main`](../../apps/desktop/src/main/README.md) và [`apps/server/src/vps-worker`](../../apps/server/src/vps-worker/README.md).

Thiết kế: mục 3, 4.2 và 6 trong [system-design.md](../../docs/system-design.md).

## Việc cần làm

- [ ] Khởi tạo package TypeScript trong workspace.
- [ ] Script tải croc **10.7.0** bản chính thức cho các nền tảng: Windows x64, macOS x64, macOS arm64, Linux x64, rồi kiểm tra checksum từ trang phát hành.
- [ ] Hàm tìm đường dẫn file chạy croc trong ba môi trường: khi phát triển, trong app đã đóng gói, và trong container server.
- [ ] Định nghĩa **quy ước gốc bộ file (payload)**: gửi thư mục gốc như thế nào, bên nhận tìm gốc ở đâu. Mọi nơi dùng chung một quy ước.
- [ ] Hàm `send({ payloadDir, code, relay, pass, timeoutMs })` và `receive({ code, outDir, relay, pass, timeoutMs })`.
  - Trả về đối tượng phát sự kiện `progress`, `done`, `error`, kèm hàm `cancel()`.
- [ ] Các cờ cố định khi gọi croc: `--yes`, `--relay`, `--pass`, `--overwrite`.
  - Truyền code qua biến môi trường `CROC_SECRET` nếu croc hỗ trợ. Nếu không thì dùng `--code` hoặc tham số dòng lệnh.
- [ ] Đọc tiến trình từ đầu ra croc: các dòng ngắt bằng `\r`, dạng `tên  xx% |…| (a/b B, tốc độ)`.
- [ ] **Timeout bắt buộc** cho mọi lượt. Người nhận thứ hai dùng cùng code sẽ treo mãi mà không báo lỗi.
- [ ] Khi huỷ hoặc hết giờ, dừng cả cây tiến trình con. Trên Windows cần xử lý riêng.
- [ ] Phân loại lỗi: hết giờ, sai mật khẩu relay, không kết nối được relay, bị huỷ, croc thoát với mã lỗi.
- [ ] Sau khi nhận, kiểm tra không có file nào nằm ngoài thư mục đích.
- [ ] Kiểm thử tích hợp với relay cục bộ (`croc --pass <pw> relay --ports …`):
  - [ ] Một gửi, một nhận thành công.
  - [ ] Người nhận thứ hai dùng cùng code phải kết thúc bằng lỗi hết giờ.
  - [ ] Huỷ giữa chừng thì không còn tiến trình croc nào sót lại.
  - [ ] Thư mục nhiều cấp, tên file tiếng Việt có dấu.

## Xong khi

Kiểm thử tích hợp chạy qua trên Linux, Windows và macOS.
