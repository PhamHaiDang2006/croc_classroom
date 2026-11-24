# croc-engine

`createCrocEngine(binary?)` cung cấp interface v1 trong `src/types.ts`. Main truyền đường dẫn croc đã đóng gói, worker có thể dùng đường dẫn tuyệt đối qua `CROC_BINARY` hoặc cài croc trong PATH. `createLoopbackEngine()` trong entry point testing dành cho kiểm thử trong cùng tiến trình.

Từ gốc repo, chạy `node packages/croc-engine/scripts/download.mjs` để tải croc 10.7.0 đúng nền tảng và xác minh checksum của release. Đối số tuỳ chọn gồm `win32-x64`, `darwin-x64`, `darwin-arm64`, `linux-x64`.

Mỗi lượt truyền chạy một tiến trình riêng với code và mật khẩu trong môi trường con. Bên gửi gửi thư mục nguồn bằng croc. Bên nhận cung cấp thư mục tạm rỗng. Engine nhận vào staging, kiểm tra kiểu file và dung lượng rồi bỏ đúng một lớp thư mục croc tạo ra. Sau thành công, đường dẫn tương đối dưới thư mục nhận trùng với gốc nguồn. Bên gọi kiểm SHA-256 bằng manifest từ server và dọn thư mục tạm.

Test relay dùng binary đã tải và cổng loopback 29871–29872. Chạy `npm test -- packages/croc-engine/test/relay.test.ts` từ gốc repo. Test này được skip nếu thiếu binary. Xem [bàn giao B](../../docs/handoffs/B.md) về kết quả theo nền tảng.
