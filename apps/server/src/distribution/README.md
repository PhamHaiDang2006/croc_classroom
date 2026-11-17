# apps/server/src/distribution

Phân phối đề: cấp vé, chọn nguồn theo **phương án A**, theo dõi seeder đang online qua WebSocket, hàng đợi.

Thiết kế: mục 6, 7.4 và 10 (phần WebSocket) trong [system-design.md](../../../../docs/system-design.md).

## Trạng thái hiện tại

Chưa triển khai. Bị chặn bởi shared v1, REST/WS envelope, quyền xác nhận vé,
ngữ nghĩa reconnect/queue và chính sách báo sai hash. Xem các đề xuất của D trong
[`D-contract-requests.md`](../../../../docs/handoffs/D-contract-requests.md).
Không đánh dấu thuật toán chọn nguồn hay xử lý vé là hoàn tất khi mới có checklist.

## Việc cần làm

- [ ] WebSocket `/ws`:
  - [ ] Xác thực bằng token phiên.
  - [ ] Nhận `hello { localSubnets }`.
  - [ ] Dò kết nối chết và tự dọn.
- [ ] Theo dõi seeder online, giữ **trong bộ nhớ**. Với mỗi user lưu: kết nối, IP công khai, subnet LAN, các bài đang chia sẻ, số lượt đang phục vụ.
- [ ] Chỉ chấp nhận `seed.announce` khi user có bản ghi `holdings` đã xác minh và không bị cấm với bài đó.
- [ ] `POST /assignments/:id/fetch`: chọn nguồn theo thứ tự:
  1. Seeder rảnh, **cùng IP công khai VÀ cùng subnet LAN**; chọn người ít được dùng gần đây nhất.
  2. VPS, nếu số phiên phát đề đang chạy < 10.
  3. Seeder rảnh bất kỳ qua Internet.
  4. Hàng đợi, ai đến trước được phục vụ trước.
- [ ] Gửi `serve.request` tới nguồn và chờ `serve.accept` tối đa 5 giây; quá hạn thì chọn nguồn khác.
- [ ] Vé:
  - [ ] Sinh code croc ≥ 128 bit; **không** lưu code vào CSDL.
  - [ ] Hạn vé = `max(2 phút, dung lượng / 100 KB/s)`.
- [ ] `POST /tickets/:id/result` và `serve.result`:
  - [ ] Cập nhật vé.
  - [ ] Người nhận xác minh xong thì thêm vào `holdings` và cập nhật `participants.received_*`.
  - [ ] Nguồn lỗi 2 lần liên tiếp thì tạm loại.
  - [ ] Nguồn gửi file sai SHA-256 thì bị **cấm** với bài đó.
- [ ] Vé hết hạn thì gửi `ticket.cancel` cho cả hai bên và giải phóng lượt.
- [ ] Khi có nguồn rảnh, lấy người đầu hàng đợi và gửi `ticket.ready`.
- [ ] **Không bao giờ** gửi IP của máy này cho máy khác.
- [ ] Unit test thuật toán chọn nguồn, bằng bảng tình huống:
  - [ ] Cùng LAN.
  - [ ] Cùng IP công khai nhưng khác subnet (CGNAT).
  - [ ] VPS đã đầy phiên.
  - [ ] Không có nguồn nào rảnh, phải xếp hàng.
  - [ ] Nguồn bị cấm.
- [ ] Kiểm thử hết hạn vé và kết nối lại sau khi server khởi động lại.
