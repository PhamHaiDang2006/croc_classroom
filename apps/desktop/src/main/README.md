# Electron main

`index.ts` khởi tạo cửa sổ, khay hệ thống và single-instance lock, đăng ký kênh IPC từ shared, kiểm frame và schema đầu vào. `desktop.ts` ánh xạ từng kênh sang phiên, REST và tác vụ file. Token ở main và chỉ lưu khi có kho mã hoá của hệ điều hành.

`rest.ts` lấy method, đường dẫn và schema từ định nghĩa endpoint. `socket.ts` quản lý kết nối, heartbeat, kết nối lại, hàng đợi và phát lại từ cache. `jobs.ts` điều phối vòng đời vé, gọi engine, kiểm manifest, xác nhận với server và phát trạng thái cho renderer. Với lượt nộp, sự kiện thành công cần có biên nhận của server.

`files.ts` tạo bản chụp file do người dùng chọn và duy trì cache theo tài khoản và server. Cache được kiểm toàn bộ khi khôi phục và trước khi chia sẻ. `folders.ts` ánh xạ ID server sang thư mục do ứng dụng quản lý trong địa điểm người dùng chọn. Bản làm bài được giữ riêng để SV có thể sửa. Khi thu phiên bản mới, app xác minh bản mới trước khi thay thư mục cũ.

[Cách chạy và đóng gói](../../README.md) · [Kết quả kiểm chứng](../../../../docs/handoffs/B.md)
