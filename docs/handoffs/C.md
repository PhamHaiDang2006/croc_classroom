# Bàn giao vai trò C

- Mốc: M0 — Nền chung (bootstrap)
- Branch / commit hoặc PR: `C/Backend` (tách từ `new` @ `c4ca79c`), commit "M0: dựng nền chung…"; chưa push, chưa có PR
- Phiên bản hợp đồng đang sử dụng: v1 (đề xuất, chưa ai review)

## Đã làm

- **Workspace**: npm workspaces (`packages/shared`, `packages/croc-engine`, `apps/server`, `apps/desktop`),
  TypeScript 6.0 strict, ESLint, Vitest, `.gitignore`, CI GitHub Actions. Công cụ: quyết định D-001.
- **`packages/shared`** (C quản lý):
  - Schema zod + kiểu cho DTO, mã lỗi và HTTP status, hằng số giới hạn mặc định.
  - Hợp đồng REST (`endpoints`, 27 endpoint), WebSocket, IPC (`window.croc`).
  - Manifest: kiểm tra đường dẫn, tính và xác minh thư mục, mã băm tổng.
  - Code phrase: danh sách 128 từ, sinh mã và chuẩn hoá chuỗi gõ vào.
  - Fixture (`/fixtures`) và mock IPC (`/mocks`).
- **`packages/croc-engine`** (khung, B quản lý): interface `CrocEngine` và engine giả `createLoopbackEngine()`.
  Không có engine thật.
- **`apps/server`** (C):
  - Fastify, cấu hình qua biến môi trường, SQLite (WAL, khoá ngoại), migration 1 tạo 7 bảng ở mục 9.
  - `registerEndpoint()`: xác thực Bearer, phân quyền vai trò, kiểm tra params/query/body và phản hồi theo hợp đồng.
  - Xử lý lỗi theo `ApiErrorBody`, `GET /health`, tắt êm khi SIGTERM.
  - Interface nội bộ `TicketIssuer` / `TransferOutcomeHandler` (đề xuất cho D) và `FakeTicketIssuer`.
- **`apps/desktop`**: chỉ có `package.json`; khung Electron do B dựng.
- **Tài liệu**: README gốc (mục "Lệnh phát triển"), AGENTS.md, contracts.md (viết lại), decisions.md
  (D-001 – D-006), integration-checklist.md (M0), README của shared, croc-engine, server, desktop.

## Giao tiếp

- Interface đang cung cấp (bên sử dụng):
  - REST + DTO + mã lỗi → B (API client), D (distribution dùng chung DTO).
  - `registerEndpoint`, `AppError`, `RouteModule` → D đăng ký route distribution.
  - `TransferOutcomeHandler` (C triển khai ở M2/M3) → D gọi khi worker xong.
  - Fixture, mock IPC → A, B.
- Interface đang sử dụng (bên cung cấp):
  - `TicketIssuer` — D (hiện dùng `FakeTicketIssuer`).
  - `CrocEngine` — B (chỉ dùng gián tiếp qua worker của D).
- **Chờ review**: REST/DTO (B, D), WS (D, B), IPC (B, A), engine (B, D), vé/worker (D), manifest (B, D),
  schema CSDL (D). Chi tiết trong contracts.md.

## Kiểm chứng

| Lệnh hoặc kịch bản | Môi trường | Kết quả | Mock hay thật |
|---|---|---|---|
| `npm ci` | Linux x64, Node 24.21.0, npm 11.19.0 | Đạt; cảnh báo install script của better-sqlite3 là bình thường (D-001) | Thật |
| `npm run check` (lint + typecheck + test + build) | như trên | Đạt; 10 file test, 188 test | Thật |
| ESLint chặn import Node.js trong `shared/src` (ngoài `node/`) và trong `apps/desktop/src/renderer` | như trên | Báo lỗi đúng với file thử qua `eslint --stdin` | Thật |
| `packages/shared/dist` phần dùng cho renderer không import module Node.js | như trên | `grep` không thấy | Thật |
| Chạy `node dist/index.js` / `npm start -w @croc-classroom/server`, gọi `/health`, route lạ, gửi SIGTERM | như trên | 200 `{status:"ok",contractVersion:1}`; 404 `NOT_FOUND`; tạo SQLite WAL `user_version=1`; tắt êm | Thật (chỉ khung, chưa có nghiệp vụ) |
| Test manifest với tên NFD, symlink, thiếu/thừa/sai hash | Linux | Đạt | Thật trên hệ thống file Linux |
| Test luồng mock IPC (đăng nhập, vào bài, nhận đề, nộp, biên nhận) | Node | Đạt | **Mock** |
| Test engine loopback (ghép đôi, người nhận thứ hai treo, huỷ, vượt dung lượng) | Node | Đạt | **Mock — không chạy croc** |
| CI trên GitHub | — | **Chưa chạy** (chưa push) | — |
| Test trên Windows, macOS | — | **Chưa chạy** | — |

## Cách chạy

- Xem README gốc, mục "Lệnh phát triển".
- Server ở máy: `cp apps/server/.env.example apps/server/.env`, sửa `RELAY_ADDRESS`/`RELAY_PASS`,
  `npm run build`, `npm start -w @croc-classroom/server`. Dữ liệu ở `apps/server/data/` (đã ignore).

## Còn thiếu / đang bị chặn

- Hợp đồng v1 chưa ai review → các bên chưa nên triển khai phần phụ thuộc. Người phụ trách: C điều phối.
- Hai chính sách cần cả nhóm: xử lý báo cáo sai hash, mật khẩu relay bị lộ (contracts.md). Người phụ trách: D.
- Tên thành viên, thời hạn: cả nhóm.
- CI chưa chạy trên GitHub: chạy khi push branch / mở PR.
- Mục checklist M0 "croc qua relay cục bộ, cổng relay từ mạng trường": B, D.
- M1 của C (chưa bắt đầu): accounts (Argon2id, phiên, CSV, kích hoạt), `SessionResolver` thật,
  giới hạn tần suất, `/config`, CLI `create-lecturer`.

## Yêu cầu bên khác

- **B**:
  - Review `ipc.ts`, `croc-engine/src/types.ts`, các quy tắc manifest (D-004), D-006 (sinh code croc).
  - Dựng khung Electron trong `apps/desktop`.
  - Kiểm chứng định dạng code croc và cách relay chia phòng khi nhiều lượt chạy song song.
  - Xác nhận cách làm này bằng: ghi tên + ngày vào cột Review trong contracts.md, hoặc gửi đề xuất sửa.
- **D**:
  - Review `ws.ts`, `ports/transfers.ts`, vòng đời vé, schema bảng `tickets`/`holdings`.
  - Xác nhận worker giữ file phiên bản đang được thu (D-005).
  - Đề xuất chính sách báo cáo sai hash, đổi mật khẩu relay, huỷ lượt truyền bị treo.
  - Thử relay và cổng từ mạng trường.
- **A**:
  - Review `ipc.ts` từ góc nhìn giao diện.
  - Thử `createMockCrocApi()` và báo những gì còn thiếu cho các màn hình.
