# apps/desktop/src/main

Tiến trình chính của Electron. Mọi việc cần mạng, file và croc đều nằm ở đây; giao diện chỉ gọi qua IPC.

Thiết kế: mục 6, 7.3–7.6 và 8 trong [system-design.md](../../../../docs/system-design.md).

## Việc cần làm

**Nền tảng**

- [ ] REST client tới server.
- [ ] WebSocket client:
  - [ ] Tự kết nối lại khi mất kết nối.
  - [ ] Mỗi lần kết nối, gửi `hello` rồi gửi `seed.announce` cho mọi bài đang có trong cache.
- [ ] Lưu token phiên bằng `safeStorage`; đăng xuất thì xoá token.
- [ ] Lấy subnet LAN bằng `os.networkInterfaces()`, dùng cho `hello` và khi xin vé.
- [ ] Cài đặt:
  - [ ] Thư mục làm bài, mặc định `<Tài liệu>/croc-classroom/`.
  - [ ] Thư mục giảng viên lưu bài thu về.
  - [ ] Bật/tắt chia sẻ lại.
  - [ ] Số lượt chia sẻ cùng lúc, mặc định 1.
- [ ] Gửi tiến trình truyền file sang giao diện qua IPC.

**Giảng viên**

- [ ] Tạo bài:
  1. Tính manifest.
  2. Gọi `POST /assignments`.
  3. Gửi đề lên VPS qua croc-engine.
  4. Chép đề vào cache chia sẻ.
  5. Hiện code phrase.
  - [ ] Tải lên lỗi thì xin vé mới và gửi lại.
- [ ] Thu bài:
  - [ ] Chạy khi mở app và mỗi khi nhận `submission.new`.
  - [ ] Xin vé `collect`, nhận về thư mục tạm, xác minh.
  - [ ] Thay thư mục `<tên bài>/<MSSV>_<HoTenKhongDau>/`, rồi báo server "đã tải".

**Sinh viên**

- [ ] Nhận đề:
  1. Gọi `join`, rồi `fetch`. Nếu đang xếp hàng thì chờ `ticket.ready`.
  2. Nhận vào thư mục tạm và xác minh SHA-256.
  3. Chép vào thư mục làm bài và vào cache chia sẻ.
  4. Báo kết quả, rồi gửi `seed.announce`.
  - [ ] Lỗi hoặc sai hash thì xoá bản tạm và xin vé mới.
- [ ] Nộp bài:
  1. Chọn file hoặc thư mục, tính manifest.
  2. Gọi `submit`, rồi gửi qua croc-engine.
  3. Hiện và lưu biên nhận.

**Chia sẻ lại (seeder, dùng cho cả giảng viên)**

- [ ] Nghe `serve.request`:
  - [ ] Còn lượt rảnh và đang bật chia sẻ thì gửi `serve.accept`, không thì gửi `serve.reject`.
  - [ ] Gửi đề từ cache, rồi báo `serve.result`.
- [ ] Cache chia sẻ:
  - [ ] Nằm trong thư mục `userData`.
  - [ ] Khi khởi động, kiểm tra nhanh bằng kích thước và thời gian sửa; nếu thay đổi thì xác minh lại đầy đủ.
  - [ ] Xoá khi bài bị xoá trên server hoặc khi người dùng tự xoá.
- [ ] Nhận `ticket.cancel` thì dừng ngay lượt croc đang chạy.
