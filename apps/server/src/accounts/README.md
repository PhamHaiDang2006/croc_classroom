# apps/server/src/accounts

Tài khoản giảng viên (admin, đúng một tài khoản) và sinh viên: đăng nhập, phiên, kích hoạt, nhập danh sách lớp.

Thiết kế: mục 7.2 và 8 trong [system-design.md](../../../../docs/system-design.md). Quyết định: D-007 trong
[decisions.md](../../../../docs/decisions.md).

## Cấu trúc

| File | Việc |
|---|---|
| `index.ts` | `createAccounts()` dựng phiên, giới hạn tần suất, dịch vụ, route |
| `service.ts` | `AccountsService`: đăng nhập, kích hoạt, nhập CSV, vô hiệu hoá, cấp lại mã, tạo/đặt lại mật khẩu GV |
| `sessions.ts` | `SessionService` (triển khai `SessionResolver`): tạo, tra, gia hạn trượt, thu hồi phiên |
| `password.ts` | Argon2id bằng `crypto.argon2` của Node 24, lưu dạng PHC |
| `tokens.ts` | Token phiên, mã kích hoạt, băm SHA-256 cho bí mật ngẫu nhiên |
| `csv.ts` | Đọc CSV `mssv,ho_ten[,lop]` |
| `routes.ts` | Đăng ký endpoint qua `registerEndpoint` |

Lệnh CLI tạo / đặt lại mật khẩu GV nằm ở `src/cli.ts`.

## Việc cần làm

- [x] Băm mật khẩu bằng Argon2id (m=19 MiB, t=2, p=1); mật khẩu tối thiểu 8 ký tự.
- [x] `POST /auth/login`: giảng viên đăng nhập bằng `username`, sinh viên bằng `mssv`.
- [x] `POST /auth/logout` (luôn 204) và `GET /me`.
- [x] Token phiên:
  - [x] Sinh ngẫu nhiên 256 bit, server chỉ lưu SHA-256.
  - [x] Hạn trượt 30 ngày.
  - [x] Thu hồi khi đăng xuất, khi tài khoản bị vô hiệu hoá, khi SV kích hoạt lại, khi đặt lại mật khẩu GV.
- [x] `POST /students/import`: nhận CSV `mssv,ho_ten[,lop]`.
  - [x] Kiểm tra dữ liệu và báo dòng lỗi; có lỗi thì không tạo tài khoản nào.
  - [x] Xử lý MSSV trùng: bỏ qua dòng trùng (đã có, hoặc lặp trong file) và báo lại cho giảng viên.
  - [x] Sinh mã kích hoạt hạn 14 ngày. Mã chỉ trả về **một lần**, server chỉ lưu bản băm.
- [x] `POST /auth/activate`: MSSV + mã kích hoạt + mật khẩu mới. Kích hoạt xong thì mã hết hiệu lực.
- [x] `GET /students`: danh sách sinh viên và trạng thái kích hoạt.
- [x] `PATCH /students/:id`: vô hiệu hoá hoặc mở lại tài khoản.
- [x] `POST /students/:id/activation-code`: cấp lại mã kích hoạt (khi sinh viên quên mật khẩu) — tách khỏi PATCH (D-003).
- [x] Giới hạn tần suất cho đăng nhập và kích hoạt: 10 lần sai mỗi 5 phút theo tài khoản + IP.
- [x] Kiểm thử (`test/accounts.test.ts`, `test/accounts-units.test.ts`, `test/cli.test.ts`):
  - [x] Kích hoạt thành công.
  - [x] Mã hết hạn hoặc đã dùng thì bị từ chối.
  - [x] Sai mật khẩu nhiều lần thì bị chặn.
  - [x] Sinh viên không gọi được API của giảng viên.
  - [x] Tài khoản bị vô hiệu hoá thì mất phiên.
- [ ] Đóng kết nối WebSocket khi phiên bị thu hồi: đã có `SessionService.onUserSessionsRevoked()`, chờ D dùng.
