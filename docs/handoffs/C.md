# Bàn giao vai trò C

- Mốc: M0 — Nền chung; M1 — Tài khoản; M2 — Bài tập và `/join`; M3 — Nộp và thu bài (đều là phía server của C)
- Branch / commit hoặc PR: `C/Backend` (tách từ `new` @ `c4ca79c`). M0: `3bdab8d`, M1: `9a61459`, đã push.
  M2: `f69d512`. M3: `038679c`. Sửa lỗi review: commit "Sửa lỗi critical–medium…" ngay sau đó. Tất cả đã push. Chưa có PR.
- Phiên bản hợp đồng đang sử dụng: v1 (đề xuất, chưa ai review; sửa `POST /auth/logout`; bổ sung/sửa interface nội bộ server ở M2, M3)

## Sửa sau review toàn bộ A-Frontend (2026-11-28)

- Đăng nhập: các lần đoán gửi song song cùng lọt qua giới hạn 10 lần / 5 phút vì lần sai chỉ được ghi sau
  khi băm Argon2 (tái hiện trên server cục bộ: 40 song song → 40 lần đoán). Sửa giống bản đã làm trên
  `C/Backend` (`253c7b8`): ghi trước lần thử, `FailureLimiter.refund` khi không phải sai mật khẩu.
  Test hồi quy trong `accounts.test.ts` (fail trên mã cũ, đạt trên mã mới).
- Chưa đưa sang: hai mục còn lại của `253c7b8` (code bài đang tải lên bị tính là sai ở `/join` — giao diện
  đã ẩn code đến khi phát hành; `onSessionRevoked` — WS đã tự đóng trong ≤ 15 giây nhờ kiểm phiên ở heartbeat).
- Kiểm chứng: `npm run check` (297 test) và `tests/e2e/classroom.mjs` đạt trên Linux x64.

## Sửa sau review code M0–M3 (2026-11-17)

Review theo quy trình skill code-reviewer; các lỗi critical–medium đã sửa, kèm test hồi quy, và chạy lại
script tái hiện trên bản build để xác nhận:

| Mức | Lỗi | Sửa | Kiểm chứng |
|---|---|---|---|
| Critical | `verifyDirectory` bỏ sót file giả trùng tên sau chuẩn hoá NFC/NFD | Báo `duplicate` (thêm vào `VerifyProblem`) | Trước: `ok:true`; sau: `ok:false` + `duplicate` |
| High | `/join` xoá bộ đếm sai cả khi vào lại bài cũ → dò code không giới hạn | Chỉ xoá khi vào bài mới | Trước: 180 lần đoán, 0 bị chặn; sau: 10 qua, 170 bị chặn |
| Medium | POST không body + `Content-Type: application/json` → 400 | Parser JSON coi body rỗng là không có body, giữ chặn `__proto__` | Trước: logout 400; sau: 204 |
| Medium | Không có giới hạn theo IP: dò hàng loạt, đổi IPv6, nghẽn CPU bằng Argon2 | Nhóm IPv6 theo /64; trần 1000 lần sai / 5 phút / nhóm IP; tối đa 2 lượt Argon2 cùng lúc | Test tự động (chưa thử tải thật) |

Còn mở (low, chưa sửa): `GET /my/assignments` parse cả manifest rồi bỏ (~19 ms / 10.000 file);
SQLite `synchronous = NORMAL` có thể mất biên nhận khi mất điện; khoảng hở khi xoá bài trong lúc D dọn VPS;
`TRUST_PROXY` trống khi chạy sau Caddy (D cần đặt khi triển khai).

## Đã làm — M3 (nộp và thu bài, phía C)

- `apps/server/src/submissions/`:
  - SV xin vé `nop_bai`: kiểm tra đã vào bài, số file, ≤ 200 MB.
  - `onSubmissionStored` trong một transaction: kiểm vé `nop_bai` còn chạy và khớp → phiên bản = lớn nhất + 1,
    giờ nộp = giờ xác minh, cờ trễ, mã băm tổng do server tính → bản cũ không còn file → vé `xong`.
    Vé bị thay / hết hạn thì từ chối; gọi lặp cho vé đã commit trả lại cùng biên nhận.
  - `GET /assignments/:id/receipt`: biên nhận mới nhất của chính SV (sau khi mất kết nối).
  - GV: danh sách một dòng / SV đã vào bài (chưa nộp / đã nộp / trễ, số lần nộp, đã tải chưa);
    thu theo ID phiên bản, bản cũ → `SUBMISSION_SUPERSEDED`; `onCollectConfirmed` ghi `collected_at` đúng phiên bản.
- `src/outcomes.ts`: ghép `TransferOutcomeHandler` đầy đủ (assignments + submissions) để giao cho D.
- Interface nội bộ (sửa): khoá "một vé chưa kết thúc" theo từng loại vé (quy tắc cũ làm GV thu bài của
  SV này huỷ vé của SV khác); `onSubmissionStored` bỏ `manifestHash`, trả `supersededStorageRefs`.
- `FakeTicketIssuer` ghi vé vào bảng `tickets` và huỷ vé cũ cùng khoá như D phải làm; `DEV_FAKE_TRANSFERS`
  tự hoàn tất cả tải đề, nộp bài, thu bài.
- Quyết định D-009; contracts.md: quy tắc vé theo loại, commit phiên bản, checklist M3.

## Đã làm — M2 (bài tập, phía C)

- `apps/server/src/assignments/`:
  - GV tạo bài: kiểm tra số file / dung lượng, sinh code phrase không trùng, mở vé `gv_tai_len` qua D;
    không mở được vé thì không tạo bài. Xin lại vé khi tải lên lỗi.
  - Phát hành khi worker gọi `onUploadStored` (lặp thì bỏ qua), lưu `storage_ref`.
  - Danh sách / chi tiết kèm thống kê (tham gia, đã nhận, đang chia sẻ, đã nộp, trễ theo bản mới nhất, chưa nộp).
  - Sửa tiêu đề / mô tả / hạn; xoá bài: nhờ D dọn VPS trước rồi mới xoá dữ liệu.
  - `/join`: chỉ bài đã phát hành, không phân biệt hoa thường, giới hạn 10 lần sai / 5 phút, giới hạn số SV;
    vào lại trả cùng thông tin. `GET /my/assignments[/:id]` chỉ bài đã tham gia, kèm biên nhận mới nhất.
  - `onFetchVerified`: ghi SV đã nhận đề (lần đầu).
- Interface nội bộ: thêm `onFetchVerified` vào `TransferOutcomeHandler`, port `SeedingStats` (D cung cấp).
- Migration 2: cột `assignments.storage_ref`, chỉ mục `participants(student_id)`.
- Chạy được trước khi có D: `unavailableTicketIssuer` (tạo bài → 503 rõ ràng), hoặc `DEV_FAKE_TRANSFERS=true`.
- Quyết định D-008; contracts.md bổ sung ngữ nghĩa lỗi tạo bài, `/join`, thống kê.

## Đã làm — M1 (tài khoản)

- `apps/server/src/accounts/`:
  - Đăng nhập (GV bằng username, SV bằng MSSV), đăng xuất, `/me`.
  - Kích hoạt SV bằng mã một lần: mã hạn 14 ngày, chỉ lưu bản băm, kích hoạt xong thì hết hiệu lực
    và thu hồi phiên cũ.
  - Nhập CSV: báo lỗi theo dòng; có lỗi thì không tạo gì; MSSV trùng thì bỏ qua và báo lại.
  - Danh sách SV, vô hiệu hoá / mở lại (vô hiệu hoá thì thu hồi phiên), cấp lại mã kích hoạt.
  - Phiên: token 256 bit, CSDL chỉ lưu SHA-256, hạn trượt 30 ngày.
  - Argon2id có sẵn trong Node 24 (`crypto.argon2`), đã đối chiếu vector RFC 9106.
  - Giới hạn 10 lần sai / 5 phút theo (tài khoản + IP) cho đăng nhập và kích hoạt.
- `GET /config`: relay + giới hạn, chỉ cho người đã đăng nhập.
- `src/cli.ts`: `create-lecturer`, `reset-lecturer-password`; mật khẩu nhập ẩn hoặc qua stdin, không qua tham số.
- Quyết định D-007; contracts.md bổ sung ngữ nghĩa mã lỗi đăng nhập/kích hoạt.

## Đã làm — M0 (nền chung)

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
- **Tài liệu**: README gốc (mục "Lệnh phát triển"), AGENTS.md, contracts.md, decisions.md (D-001 – D-006),
  integration-checklist.md, README của shared, croc-engine, server, desktop.

## Giao tiếp

- Interface đang cung cấp (bên sử dụng):
  - REST tài khoản đã chạy thật: `/auth/login`, `/auth/activate`, `/auth/logout`, `/me`, `/config`,
    `/students*` → B (API client), A (qua IPC).
  - REST bài tập đã chạy thật: `/assignments*`, `/join`, `/my/assignments*` → B, A.
  - REST bài nộp đã chạy thật: `/assignments/:id/submit`, `/assignments/:id/receipt`,
    `/assignments/:id/submissions`, `/submissions/:id/collect` → B, A.
  - REST + DTO + mã lỗi còn lại (chưa triển khai) → B, D.
  - `SessionService` (`SessionResolver`) → D dùng để xác thực WebSocket.
  - `SessionService.onUserSessionsRevoked()` → D đóng WS (mã `WS_CLOSE.revoked`) khi phiên bị thu hồi.
  - `registerEndpoint`, `AppError`, `RouteModule`, `FailureLimiter` → D.
  - `TransferOutcomeHandler` đầy đủ (`createTransferOutcomeHandler` trong `src/outcomes.ts`) → D gọi khi worker xong.
  - Fixture, mock IPC → A, B.
- Interface đang sử dụng (bên cung cấp):
  - `TicketIssuer` — D (server chạy: `unavailableTicketIssuer`; test: `FakeTicketIssuer`).
  - `SeedingStats` — D (hiện `noSeedingStats`, luôn 0).
  - `CrocEngine` — B (chỉ dùng gián tiếp qua worker của D).
- **Chờ review**: REST/DTO (B, D), WS (D, B), IPC (B, A), engine (B, D), vé/worker (D), manifest (B, D),
  schema CSDL (D). Chi tiết trong contracts.md.

## Kiểm chứng

| Lệnh hoặc kịch bản | Môi trường | Kết quả | Mock hay thật |
|---|---|---|---|
| `npm run check` (lint + typecheck + test + build) | Linux x64, Node 24.21.0, npm 11.19.0 | Đạt; 15 file test, 277 test (sau khi sửa lỗi review) | Thật |
| Test HTTP bài nộp (`submissions.test.ts`): xin vé, chưa vào bài, vượt dung lượng / số file, VPS đầy, đúng hạn / trễ / không hạn, vé bị thay không commit, bản mới lỗi giữ bản cũ, gọi lặp, vé không khớp, biên nhận sau mất kết nối, quyền xem, danh sách GV, thu đúng phiên bản, thu song song nhiều SV, xác nhận đã tải, xoá bài | SQLite trong bộ nhớ, đồng hồ giả, **vé giả ghi bảng tickets** | Đạt | Server thật, vé **giả** |
| Server đã build, `DEV_FAKE_TRANSFERS=true`, CSDL mới, GV tạo bằng CLI: tạo bài → SV vào bài → xin vé nộp → chưa có biên nhận → có biên nhận v1 → nộp lại v2 → GV xem danh sách → thu v2 → đã tải gắn v2 → thu v1 bị từ chối → SV không xem được danh sách → thống kê | `node dist/index.js` + `fetch` | 13/13 đạt; log không có lỗi | Server thật, vé **giả** |
| Test HTTP bài tập (`assignments.test.ts`): tạo bài, code phrase không trùng, giới hạn manifest, VPS đầy, xin lại vé, phát hành lặp, `/join` trước/sau phát hành, giới hạn nhập sai, đủ SV, quyền xem, thống kê, sửa, xoá, D dọn lỗi | SQLite trong bộ nhớ, đồng hồ giả, **vé giả** | Đạt | Server thật, vé **giả** |
| Server đã build, chế độ mặc định: tạo bài → 503 "chưa có dịch vụ truyền file", không để lại bài | `node dist/index.js` + `fetch`, CSDL file từ lần thử M1 | Đạt; migration 2 tự áp dụng trên CSDL cũ (user_version 1 → 2) | Thật |
| Server đã build, `DEV_FAKE_TRANSFERS=true`: tạo bài → code chưa dùng được → tự phát hành → SV vào bài, nhận manifest → danh sách SV → thống kê → sửa hạn → xoá | như trên | 10/10 bước đạt; log có cảnh báo chế độ giả | Server thật, vé **giả** |
| Test HTTP tài khoản qua `app.inject` (`accounts.test.ts`): CSV, kích hoạt, mã hết hạn/đã dùng, phân quyền, vô hiệu hoá, cấp lại mã, giới hạn tần suất, hạn trượt, đăng xuất | như trên, SQLite trong bộ nhớ, đồng hồ giả | Đạt | Thật (server + CSDL thật, không mạng) |
| Log server không chứa token, mật khẩu, mã kích hoạt, mật khẩu relay (log mức trace) | như trên | Đạt | Thật |
| Argon2id khớp vector RFC 9106 §5.3 | như trên | Đạt | Thật |
| CLI `create-lecturer` (mật khẩu qua pipe), tạo lần hai, `reset-lecturer-password`, không có lệnh | `node dist/cli.js`, SQLite file | Đạt; lần hai báo đã có GV trước khi hỏi mật khẩu | Thật |
| CLI nhập mật khẩu ẩn từ bàn phím | — | **Chưa chạy** (môi trường thử không có terminal tương tác) | — |
| Kịch bản HTTP qua mạng vào server đã build: GV đăng nhập → nhập CSV → SV chưa kích hoạt bị từ chối → kích hoạt → đăng nhập → `/me` → `/config` → SV gọi API GV bị 403 → vô hiệu hoá làm mất phiên → GV đăng xuất | `node dist/index.js` + `fetch` | 10/10 bước đạt; log 28 dòng, không có secret | Thật |
| M0: `npm ci`, ranh giới ESLint, `/health`, tắt êm | như trên | Đạt (chi tiết trong commit `3bdab8d`) | Thật |
| Luồng mock IPC; engine loopback | Node | Đạt | **Mock** |
| CI trên GitHub | — | **Chưa chạy** (chưa có PR) | — |
| Test trên Windows, macOS | — | **Chưa chạy** | — |

## Cách chạy

- Xem README gốc, mục "Lệnh phát triển"; lệnh CLI trong `apps/server/README.md`.
- Server ở máy: `cp apps/server/.env.example apps/server/.env`, sửa `RELAY_ADDRESS`/`RELAY_PASS`,
  `npm run build`, tạo GV bằng CLI, `npm start -w @croc-classroom/server`. Dữ liệu ở `apps/server/data/` (đã ignore).

## Còn thiếu / đang bị chặn

- Hợp đồng v1 chưa ai review. Người phụ trách: C điều phối.
- M1 tích hợp UI → IPC → server: chờ A, B. Đóng WebSocket khi thu hồi phiên: chờ D.
- Hai chính sách cần cả nhóm: xử lý báo cáo sai hash, mật khẩu relay bị lộ (contracts.md). Người phụ trách: D.
- Tên thành viên, thời hạn: cả nhóm.
- CI chưa chạy trên GitHub: chạy khi mở PR.
- Mục checklist M0 "croc qua relay cục bộ, cổng relay từ mạng trường": B, D.
- M2 tích hợp thật (gửi đề, nhận đề, xoá file trên VPS): chờ `TicketIssuer`, worker, `SeedingStats` của D và app của B.
- M3 tích hợp thật (nộp, thu bằng croc; WS `ticket.updated`, `submission.new`; app tự thu khi mở): chờ D, B.
- M4 phía C: dữ liệu và quyền cho chia sẻ lại (`holdings`, `participants`) — phối hợp D, chưa bắt đầu.

## Yêu cầu bên khác

- **B**:
  - Review `ipc.ts`, `croc-engine/src/types.ts`, các quy tắc manifest (D-004), D-006 (sinh code croc).
  - Dựng khung Electron trong `apps/desktop`. API client có thể gọi endpoint tài khoản và bài tập trên server
    thật; dùng `DEV_FAKE_TRANSFERS=true` để thử luồng tạo bài → phát hành → `/join` khi chưa có D.
  - Kiểm chứng định dạng code croc và cách relay chia phòng khi nhiều lượt chạy song song.
  - Xác nhận bằng: ghi tên + ngày vào cột Review trong contracts.md, hoặc gửi đề xuất sửa.
- **D**:
  - Review `ws.ts`, `ports/transfers.ts`, vòng đời vé, schema bảng `tickets`/`holdings`.
  - Xác thực WebSocket bằng `SessionService.resolve()`; đóng kết nối khi `onUserSessionsRevoked`.
  - Triển khai `TicketIssuer` thật và `SeedingStats`, gọi `onUploadStored` / `onFetchVerified`; review D-008
    (ai ghi bảng nào, thứ tự xoá bài) và cột `storage_ref`.
  - Review D-009: ghi vé vào `tickets` khi mở, khoá "một vé chưa kết thúc" theo loại vé, C chuyển vé nộp
    sang `xong` trong transaction commit, xoá file `supersededStorageRefs` khi không còn vé thu bài dùng,
    gửi WS `ticket.updated` (kèm biên nhận) và `submission.new` sau `onSubmissionStored`.
  - Xác nhận worker giữ file phiên bản đang được thu (D-005).
  - Đề xuất chính sách báo cáo sai hash, đổi mật khẩu relay, huỷ lượt truyền bị treo.
  - Thử relay và cổng từ mạng trường.
- **A**:
  - Review `ipc.ts` từ góc nhìn giao diện.
  - Thử `createMockCrocApi()` và báo những gì còn thiếu cho các màn hình.
