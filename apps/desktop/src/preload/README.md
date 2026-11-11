# apps/desktop/src/preload

Cầu nối IPC giữa giao diện (renderer) và tiến trình chính. Cầu chỉ mở đúng những hàm giao diện cần dùng.

Thiết kế: mục 8, dòng "Electron", trong [system-design.md](../../../../docs/system-design.md).

## Việc cần làm

- [ ] Dùng `contextBridge` mở một API có kiểu, lấy kiểu từ [`packages/shared`](../../../../packages/shared/README.md). Gồm:
  - [ ] Đăng nhập, đăng xuất, kích hoạt.
  - [ ] Bài tập, nhận đề, nộp bài, thu bài.
  - [ ] Cài đặt, mở thư mục.
  - [ ] Đăng ký nhận sự kiện tiến trình truyền file.
- [ ] **Không** mở trực tiếp `ipcRenderer`, `fs`, `child_process` hay bất kỳ module Node nào.
- [ ] Mọi tham số từ giao diện phải được kiểm tra lại ở phía tiến trình chính.
- [ ] Cấu hình cửa sổ: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- [ ] Chặn điều hướng và mở cửa sổ mới tới địa chỉ lạ.
