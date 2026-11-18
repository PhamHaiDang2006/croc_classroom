# Checklist tích hợp nhóm

Chỉ đánh dấu khi có bằng chứng trong bàn giao/PR.
Mỗi lần chạy ghi commit, môi trường, lệnh hoặc bước thực hiện, kết quả và lỗi.

## M0 — Nền chung

- [x] Workspace và lệnh dev/build/typecheck/test được ghi chính xác trong README.
  — C, 2026-11-17, branch `C/Backend`, Linux x64 / Node 24.21; bằng chứng trong `handoffs/C.md`.
- [ ] Hợp đồng v1 REST, WS, IPC, engine và worker có định nghĩa cụ thể, bên sử dụng đã review.
  — Đã có định nghĩa (contracts.md); **chưa ai review**.
- [ ] Fixture và mock dùng chung đúng hợp đồng; renderer không import phụ thuộc Node.js.
  — Fixture được test bằng schema; ESLint chặn import Node.js ở shared và renderer. Chờ A/B dùng thử.
- [ ] CI kiểm tra được khung dự án.
  — Đã có `.github/workflows/ci.yml`, các bước đã chạy được ở máy; **chưa chạy trên GitHub**.
- [ ] Croc gửi/nhận qua relay cục bộ; kiểm tra cổng relay từ mạng trường và ghi kết quả thật.
  — Chưa làm (B: engine thật; D: relay và mạng trường).

## M1 — Tài khoản

- [ ] Nhập CSV, kích hoạt, đăng nhập/đăng xuất qua UI → IPC → server thật.
  — Phía server đạt (C, 2026-11-17, gọi HTTP vào server thật, xem `handoffs/C.md`). Chờ A (UI), B (IPC, API client).
- [x] SV không gọi được chức năng GV; tài khoản bị vô hiệu hoá bị thu hồi phiên.
  — C, 2026-11-17, server thật + test tự động. Áp dụng cho REST; đóng WebSocket khi thu hồi chờ D.
- [ ] Lỗi xác thực/mạng hiển thị đúng; token không lộ ra log hoặc renderer ngoài nhu cầu.
  — Log server không chứa token/mật khẩu/mã kích hoạt (test + server thật). Hiển thị lỗi và renderer: chờ A, B.

## M2 — Giao và nhận đề

- [ ] GV gửi đề thật; code chỉ dùng sau khi VPS xác minh đầy đủ.
  — Phía C đạt: `/join` từ chối bài `dang_tai_len`, bài chỉ phát hành khi worker gọi `onUploadStored`
  (test + server thật với vé giả). Gửi đề thật: chờ B (engine, app), D (vé, worker).
- [ ] SV join/fetch, nhận từ VPS và xác minh manifest; cache tách bản làm bài.
  — `/join` trả manifest (C, đạt). fetch, nhận, cache: chờ B, D.
- [ ] Sai hash, file thiếu/thừa, timeout và huỷ được xử lý, không sót tiến trình. — B, D.
- [ ] Tải lên lỗi có thể xin lại vé; reconnect lấy được trạng thái thực tế.
  — Xin lại vé `POST /assignments/:id/upload-ticket` (C, đạt với vé giả). `GET /tickets/:id`, WS: chờ D.

## M3 — Nộp và thu

- [ ] Nộp đúng/trễ hạn, vượt dung lượng và nộp lại; biên nhận dựa trên xác minh VPS.
  — Phía C đạt: biên nhận chỉ tạo khi worker gọi `onSubmissionStored` (test + server thật, vé **giả**).
  Truyền file thật: chờ B, D.
- [ ] Bản mới lỗi không làm mất bản cũ; nộp đồng thời tuân thủ quy tắc version đã chốt.
  — Phía C đạt (test: vé bị thay / hết hạn không commit được, gọi lặp an toàn). Quy tắc version chờ D review (D-009).
- [x] SV không xem/tải bài của người khác.
  — C, 2026-11-17: biên nhận, danh sách bài nộp, vé thu bài đều bị chặn với SV khác (test + server thật).
  Tải file chỉ có qua vé `gv_thu_bai`, SV không xin được.
- [ ] GV mở lại app thu đúng bản mới nhất; xác nhận đã tải gắn với đúng version.
  — Phía C đạt: thu theo ID phiên bản, bản cũ → `SUBMISSION_SUPERSEDED`, `collected_at` gắn đúng phiên bản.
  App tự thu khi mở: chờ B.
- [ ] Mất kết nối sau nộp vẫn truy vấn lại được biên nhận.
  — `GET /assignments/:id/receipt` (C, đạt). `GET /tickets/:id` và WS `ticket.updated`: chờ D; app: chờ B.

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
