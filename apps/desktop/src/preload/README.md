# Electron preload

`index.ts` cung cấp `window.croc.invoke` và `window.croc.on` theo kiểu CrocApi của shared. Bridge kiểm tên kênh và sự kiện, chỉ chuyển payload đến listener và trả hàm gỡ đăng ký. Main kiểm schema trước khi xử lý. Sandbox preload dùng bundle CommonJS với Electron là module ngoài.

[Bàn giao và cách kiểm tra với Electron thật](../../../../docs/handoffs/B.md)
