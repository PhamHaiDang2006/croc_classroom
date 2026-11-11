# apps/server/src/accounts

Tài khoản giảng viên (admin, đúng một tài khoản) và sinh viên: đăng nhập, phiên, kích hoạt, nhập danh sách lớp.

Thiết kế: mục 7.2 và 8 trong [system-design.md](../../../../docs/system-design.md).

## Việc cần làm

- [ ] Băm mật khẩu bằng Argon2id; mật khẩu tối thiểu 8 ký tự.
- [ ] `POST /auth/login`: giảng viên đăng nhập bằng `username`, sinh viên bằng `mssv`.
- [ ] `POST /auth/logout` và `GET /me`.
- [ ] Token phiên:
  - [ ] Sinh ngẫu nhiên, server chỉ lưu bản băm.
  - [ ] Hạn trượt 30 ngày.
  - [ ] Thu hồi khi đăng xuất hoặc khi tài khoản bị vô hiệu hoá.
- [ ] `POST /students/import`: nhận CSV `mssv,ho_ten[,lop]`.
  - [ ] Kiểm tra dữ liệu và báo dòng lỗi.
  - [ ] Xử lý MSSV trùng: bỏ qua dòng trùng và báo lại cho giảng viên.
  - [ ] Sinh mã kích hoạt hạn 14 ngày. Mã chỉ trả về **một lần**, server chỉ lưu bản băm.
- [ ] `POST /auth/activate`: MSSV + mã kích hoạt + mật khẩu mới. Kích hoạt xong thì mã hết hiệu lực.
- [ ] `GET /students`: danh sách sinh viên và trạng thái kích hoạt.
- [ ] `PATCH /students/:id`: vô hiệu hoá hoặc mở lại tài khoản; cấp lại mã kích hoạt (khi sinh viên quên mật khẩu).
- [ ] Giới hạn tần suất cho đăng nhập và kích hoạt, ví dụ 10 lần sai mỗi 5 phút theo tài khoản + IP.
- [ ] Kiểm thử:
  - [ ] Kích hoạt thành công.
  - [ ] Mã hết hạn hoặc đã dùng thì bị từ chối.
  - [ ] Sai mật khẩu nhiều lần thì bị chặn.
  - [ ] Sinh viên không gọi được API của giảng viên.
  - [ ] Tài khoản bị vô hiệu hoá thì mất phiên.
