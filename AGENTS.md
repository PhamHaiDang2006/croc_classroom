# Quy tắc làm việc cho người và AI

## Trạng thái và nguồn tham chiếu

Repository: có workspace, hợp đồng v1 trong `packages/shared` (chờ review), server có module tài khoản
(M1), bài tập (M2), bài nộp (M3). Có React renderer/Vite preview với mock IPC (A).
Chưa có truyền file thật, Electron main/preload hay engine croc thật. Xem `docs/frontend.md`.
Các prompt là hướng dẫn công việc tương lai, không phải bằng chứng đã triển khai.

Trước khi làm, đọc:

1. `docs/system-design.md`: yêu cầu nghiệp vụ đã chốt.
2. `docs/team-plan.md`: phân công, mốc và quyền sửa file.
3. `docs/contracts.md`: trạng thái hợp đồng giao tiếp.
4. `docs/decisions.md`: các quyết định và vấn đề đang mở.
5. README của module liên quan và tài liệu bàn giao của bên cung cấp interface.

Chỉ dẫn trực tiếp của người dùng được ưu tiên. Không tự đổi yêu cầu nghiệp vụ đã chốt.
Không tự tạo sub-agent; chỉ dùng khi người dùng yêu cầu rõ.

## Phạm vi

| Vai trò | Phụ trách chính |
|---|---|
| A | `apps/desktop/src/renderer/` |
| B | `apps/desktop/src/main/`, `apps/desktop/src/preload/`, `packages/croc-engine/`, khung và đóng gói desktop |
| C | Khung server, CSDL, `accounts/`, `assignments/`, `submissions/`; quản lý file chung ở gốc và hợp đồng shared |
| D | `distribution/`, `vps-worker/`, `deploy/`, điều phối `tests/e2e/` |

Mỗi người kiểm thử phần mình; D không chịu toàn bộ việc kiểm thử.
Đọc module khác để hiểu tích hợp, nhưng không sửa ngoài phạm vi trừ khi được giao rõ.
Chủ module có thể sửa tài liệu bàn giao của mình trong `docs/handoffs/`.

## Hợp đồng và file dùng chung

- Dùng kiểu/schema từ `packages/shared`; không sao chép DTO, mã lỗi hoặc tên sự kiện.
- Không tự đổi endpoint, payload, IPC hoặc interface đang được bên khác sử dụng.
- Khi cần đổi, ghi đề xuất vào `docs/handoffs/<vai-tro>-contract-requests.md`: lý do,
  thay đổi cụ thể, bên bị ảnh hưởng, tương thích/migration và cách kiểm chứng.
- Người quản lý hợp đồng và các bên sử dụng review; merge hợp đồng vào nhánh chung
  trước khi các nhánh phụ thuộc cập nhật theo. Tiếp tục việc không bị chặn trong lúc chờ.
- C quản lý cấu hình gốc, workspace, lockfile, CI và tích hợp `packages/shared`.
  B đề xuất IPC/croc-engine; D đề xuất WebSocket/worker/vé; A review IPC.
- Không để phần shared được renderer import kéo theo `fs`, secret hoặc phụ thuộc Node.js.
- Mock phải đúng interface và fixture chung; tách chế độ mock khỏi chế độ thật.

## Cách làm và kiểm chứng

- Dùng checkout/worktree và branch riêng cho mỗi người; tích hợp bằng PR nhỏ theo mốc.
- Không ghi đè thay đổi của người khác, không tự commit/push/merge nếu chưa được giao.
- Không thêm tính năng ngoài thiết kế; ghi quyết định kỹ thuật vào `docs/decisions.md`.
- Không ghi secret, token, mật khẩu relay hoặc code croc vào log/tài liệu mẫu.
- Lệnh lint/typecheck/test/build ghi trong README gốc, mục "Lệnh phát triển";
  `npm run check` chạy đủ như CI. Không báo đã test nếu chỉ có checklist hoặc mock.
- Route server đăng ký qua `registerEndpoint` với định nghĩa trong `endpoints` của shared.
- Khi có mã nguồn, chạy typecheck, kiểm thử phù hợp và build phần bị ảnh hưởng;
  chạy tích hợp thật cho mốc có truyền file khi môi trường cho phép.
- Nếu thiếu môi trường, ghi rõ kiểm tra chưa chạy và lý do; không coi đó là đạt.

## Tiêu chí bàn giao

Một phần được bàn giao khi đúng hợp đồng, xử lý lỗi liên quan, có kiểm chứng và
tài liệu `docs/handoffs/<vai-tro>.md` theo mẫu. Tách rõ: đã code, đã test với mock,
đã tích hợp thật và việc còn thiếu. TODO hoặc giao diện giả không phải tính năng hoàn tất.
