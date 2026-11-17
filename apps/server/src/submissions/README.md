# apps/server/src/submissions

Nộp bài (sinh viên → VPS), biên nhận, giảng viên thu bài (VPS → giảng viên).

Thiết kế: mục 7.5 và 7.6 trong [system-design.md](../../../../docs/system-design.md). Quyết định: D-005, D-009
trong [decisions.md](../../../../docs/decisions.md).

## Cấu trúc

| File | Việc |
|---|---|
| `index.ts` | `createSubmissions()`: dịch vụ + route; nhận `TicketIssuer` (D) |
| `service.ts` | `SubmissionsService`: xin vé nộp, biên nhận, danh sách cho GV, thu bài; triển khai `onSubmissionStored`, `onCollectConfirmed` |
| `queries.ts` | Đọc dòng `submissions`, chuyển thành biên nhận |
| `routes.ts` | Đăng ký endpoint qua `registerEndpoint` |

`src/outcomes.ts` ghép phần xử lý kết quả của assignments + submissions thành `TransferOutcomeHandler`
đầy đủ để giao cho D.

## Việc cần làm

- [x] `POST /assignments/:id/submit` (sinh viên):
  - [x] Kiểm tra sinh viên đã tham gia bài (`NOT_PARTICIPANT`).
  - [x] Kiểm tra manifest hợp lệ, số file, tổng dung lượng ≤ 200 MB.
  - [x] Nhờ dịch vụ vé (D) mở vé `nop_bai`; vé cũ của chính SV cho bài này bị thay.
- [x] Khi worker báo nhận xong và xác minh xong (`onSubmissionStored`, một transaction):
  - [x] Kiểm tra vé còn `dang_chay` và khớp (bài, SV); không thì từ chối để worker xoá bản vừa lưu.
  - [x] Giờ nộp = lúc xác minh xong, lưu theo UTC.
  - [x] Đặt `is_late` khi bài có hạn nộp và giờ nộp > hạn.
  - [x] Tăng `version`. Bản mới thay bản cũ chỉ **sau khi** bản mới hợp lệ; trả `supersededStorageRefs` để D xoá file cũ.
  - [x] Trả biên nhận gồm mã bài nộp, giờ nộp, mã băm tổng (server tự tính).
  - [x] Gọi lặp cho vé đã commit trả lại cùng biên nhận.
- [ ] Gửi `submission.new` cho giảng viên nếu đang online — D (WebSocket) gửi sau khi `onSubmissionStored` trả về.
- [x] `GET /assignments/:id/receipt`: biên nhận mới nhất của chính sinh viên.
- [x] `GET /assignments/:id/submissions` (giảng viên): danh sách, trạng thái chưa nộp / đã nộp / trễ, giờ nộp, số lần nộp, đã tải về chưa.
- [x] `POST /submissions/:id/collect` (giảng viên): mở vé `gv_thu_bai` cho đúng phiên bản; bản cũ → `SUBMISSION_SUPERSEDED`.
  - [x] Khi giảng viên báo đã tải về và xác minh (`onCollectConfirmed`), ghi `collected_at` cho phiên bản đó.
- [x] Phân quyền: sinh viên không xem hay tải được bài nộp của người khác.
- [x] Kiểm thử (`test/submissions.test.ts`):
  - [x] Nộp đúng hạn và nộp trễ; bài không có hạn.
  - [x] Nộp lại: bản cũ chỉ bị thay khi bản mới hợp lệ; vé cũ bị thay không commit được.
  - [x] Nộp vượt dung lượng, quá số file.
  - [x] Nộp vào bài chưa tham gia.
  - [x] Sinh viên tìm cách xem bài người khác.
- [ ] Kiểm chứng với worker và file thật: chờ D, B.
