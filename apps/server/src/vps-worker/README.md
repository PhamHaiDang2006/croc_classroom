# apps/server/src/vps-worker

Chạy croc trên VPS qua [`packages/croc-engine`](../../../../packages/croc-engine/README.md) và quản lý kho file `/data`.
Các module khác chỉ yêu cầu worker "mở một lượt nhận/gửi". Không module nào khác tự chạy croc.

Thiết kế: mục 5, 7.3, 7.5, 7.6 và 13 trong [system-design.md](../../../../docs/system-design.md).

## Trạng thái hiện tại

Chưa triển khai. Cần shared ticket/manifest schema, interface croc-engine từ B,
quyền worker xác nhận kết quả và cấu hình server/data directory được C chốt. Xem
[yêu cầu hợp đồng D](../../../../docs/handoffs/D-contract-requests.md). Các luồng
nhận/gửi, giới hạn dung lượng và phục hồi restart chưa được kiểm thử.

## Việc cần làm

- [ ] Bố cục `/data`:
  - `db/`: file SQLite.
  - `assignments/<id>/payload/`: bản đề đã xác minh.
  - `submissions/<assignmentId>/<studentId>/current/`: bài nộp mới nhất.
  - `tmp/`: thư mục nhận tạm.
- [ ] Hai bể tiến trình croc riêng (mục 13):
  - **Phát đề**: tối đa 10 lượt cùng lúc.
  - **Nộp bài + giảng viên tải đề lên + giảng viên thu bài**: tối đa 10 lượt cùng lúc.
- [ ] Nhận (`gv_tai_len`, `nop_bai`):
  - [ ] Kiểm tra dung lượng đĩa còn trống trước khi nhận.
  - [ ] Nhận vào `tmp/`; theo dõi dung lượng và dừng croc nếu vượt giới hạn.
  - [ ] Xác minh theo manifest.
  - [ ] Chuyển vào kho bằng thao tác rename nguyên tử.
- [ ] Gửi (`phat_de`, `gv_thu_bai`): gửi từ kho.
- [ ] Dọn `tmp/` khi lỗi, khi vé hết hạn, và khi server khởi động lại.
- [ ] Báo kết quả từng lượt cho [`assignments`](../assignments/README.md), [`distribution`](../distribution/README.md), [`submissions`](../submissions/README.md).
- [ ] Kiểm thử tích hợp với relay cục bộ:
  - [ ] Một lượt nhận và một lượt gửi trọn vẹn.
  - [ ] Nhận vượt dung lượng thì bị dừng.
  - [ ] Manifest sai thì không có gì vào kho.
  - [ ] Bể tiến trình đầy thì từ chối mở lượt mới.
