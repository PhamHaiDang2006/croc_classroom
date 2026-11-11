# apps/server/src/submissions

Nộp bài (sinh viên → VPS), biên nhận, giảng viên thu bài (VPS → giảng viên).

Thiết kế: mục 7.5 và 7.6 trong [system-design.md](../../../../docs/system-design.md).

## Việc cần làm

- [ ] `POST /assignments/:id/submit` (sinh viên):
  - [ ] Kiểm tra sinh viên đã tham gia bài.
  - [ ] Kiểm tra manifest hợp lệ và tổng dung lượng ≤ 200 MB.
  - [ ] Nhờ [`vps-worker`](../vps-worker/README.md) mở vé `nop_bai`.
- [ ] Khi worker báo nhận xong và xác minh xong:
  - [ ] Giờ nộp = lúc xác minh xong, lưu theo UTC.
  - [ ] Đặt `is_late` khi bài có hạn nộp và giờ nộp > hạn.
  - [ ] Tăng `version`. Bản mới thay bản cũ chỉ **sau khi** bản mới hợp lệ.
  - [ ] Trả biên nhận gồm mã bài nộp, giờ nộp, mã băm tổng.
- [ ] Gửi `submission.new` cho giảng viên nếu đang online.
- [ ] `GET` biên nhận bài nộp của chính sinh viên.
- [ ] `GET /assignments/:id/submissions` (giảng viên): danh sách, trạng thái chưa nộp / đã nộp / trễ, giờ nộp, số lần nộp, đã tải về chưa.
- [ ] `POST /submissions/:id/collect` (giảng viên): mở vé `gv_thu_bai`.
  - [ ] Khi giảng viên báo đã tải về và xác minh, ghi `collected_at`.
- [ ] Phân quyền: sinh viên không xem hay tải được bài nộp của người khác.
- [ ] Kiểm thử:
  - [ ] Nộp đúng hạn và nộp trễ.
  - [ ] Nộp lại: bản cũ chỉ bị thay khi bản mới hợp lệ.
  - [ ] Nộp vượt dung lượng.
  - [ ] Nộp vào bài chưa tham gia.
  - [ ] Sinh viên tìm cách xem bài người khác.
