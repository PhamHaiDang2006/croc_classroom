# packages/croc-engine

Bọc croc CLI. Đây là **nơi duy nhất** trong hệ thống chạy croc và đọc đầu ra của croc.
Được dùng bởi [`apps/desktop/src/main`](../../apps/desktop/src/main/README.md) và [`apps/server/src/vps-worker`](../../apps/server/src/vps-worker/README.md).

Thiết kế: mục 3, 4.2 và 6 trong [system-design.md](../../docs/system-design.md).

## ✅ Hoàn thành

- [x] Package TypeScript trong workspace, dùng pnpm workspaces.
- [x] Script tải croc **10.7.0** cho các nền tảng: Windows x64, macOS x64, macOS arm64, Linux x64, kiểm tra SHA256 từ trang phát hành (GitHub API).
- [x] Module `finder.ts`: tìm croc trong ba môi trường (dev, app, container), hỗ trợ platform detection.
- [x] Quy ước gốc bộ file: gửi toàn bộ directory được chỉ định; bên nhận nhận vào `outDir` chỉ định.
- [x] Export functions `send()` và `receive()`:
  - Tham số: `{ payloadDir|code, code|outDir, relay, pass, timeoutMs }`
  - Trả về object với `.on("progress" | "done" | "error")` và `.cancel()` và `.isActive()`.
- [x] Cờ cố định: `--yes`, `--relay`, `--pass`, `--overwrite`.
  - Code được truyền qua `CROC_SECRET` nếu hỗ trợ, nếu không dùng `--code`.
- [x] Parser `progress-parser.ts`: đọc dòng croc (phân cách bởi `\r`), trích % và tốc độ.
- [x] **Timeout bắt buộc** với `setTimeout` + tree-kill; lần nhận thứ hai tự động lỗi TIMEOUT.
- [x] Dừng cây tiến trình: dùng `tree-kill` (hỗ trợ Windows với `taskkill`, Unix với signal).
- [x] Phân loại lỗi: enum `TransferErrorType` gồm TIMEOUT, RELAY_AUTH_FAILED, RELAY_CONNECT_FAILED, CANCELLED, PROCESS_EXIT, SECURITY_VIOLATION, PATH_ESCAPE, UNKNOWN.
- [x] Xác minh path safety sau nhận: `verifyPathSafety()` kiểm tra không có file nào ở ngoài `outDir`.
- [x] Unit test cho progress parser và finder.

## Chưa hoàn thành (phụ thuộc vào croc binary)

- [ ] Integration test với relay cục bộ:
  - [ ] Một gửi, một nhận thành công.
  - [ ] Người nhận thứ hai dùng cùng code lỗi TIMEOUT.
  - [ ] Cancel giữa chừng → không còn tiến trình croc nào.
  - [ ] Thư mục lồng, tên file tiếng Việt NFD/NFC.

## Hướng dẫn sử dụng

### Tải croc

```bash
cd packages/croc-engine
npm run download-croc
```

### Gửi file

```typescript
import { send } from "@croc-classroom/croc-engine";

const transfer = send({
  payloadDir: "/path/to/files",
  code: "my-code-phrase",
  relay: "relay.example.com:9009",
  pass: "relay-password",
  timeoutMs: 60000,
});

transfer.on("progress", (p) => console.log(`${p.percentage}%`));
transfer.on("done", (r) => console.log("Sent!"));
transfer.on("error", (e) => console.error(e.type));
```

### Nhận file

```typescript
import { receive } from "@croc-classroom/croc-engine";

const transfer = receive({
  code: "my-code-phrase",
  outDir: "/path/to/output",
  relay: "relay.example.com:9009",
  pass: "relay-password",
  timeoutMs: 120000,
});

transfer.on("done", (r) => console.log("Received!"));
transfer.on("error", (e) => console.error(e.type));
await transfer.cancel(); // Can cancel anytime
```

Xem chi tiết tại [USAGE.md](./USAGE.md) và [ARCHITECTURE.md](./ARCHITECTURE.md).
