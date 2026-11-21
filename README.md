# croc-classroom — Giao–Nộp bài tập qua croc

> Tên dự án tạm. Trạng thái: **phía server của C xong M0 (hợp đồng v1 chờ review), M1 (tài khoản),
> M2 (bài tập, `/join`), M3 (nộp bài, biên nhận, thu bài). Chưa có truyền file thật (D), app desktop (A, B),
> engine croc thật (B).**

Ứng dụng desktop (Electron) giúp **một giảng viên** giao bài cho sinh viên bằng **một code phrase duy nhất**
và nhận bài nộp. File được truyền bằng [croc](https://github.com/schollz/croc), có mã hoá đầu–cuối, qua relay
riêng đặt trên VPS. Sinh viên đã nhận đề sẽ tự chia sẻ lại cho bạn **cùng mạng LAN**.

## Tài liệu

- **[Thiết kế hệ thống](docs/system-design.md)**: yêu cầu, các phương án đã cân nhắc, kiến trúc, các luồng nghiệp vụ, bảo mật, dữ liệu, API, rủi ro.
- **[Bàn giao frontend và bản sửa tích hợp C–D](docs/handoffs/A.md)**: nhánh `codex/frontend`
  chứa cả C/Backend và D_role; sửa lifecycle/triển khai trước khi xây dựng giao diện.

## Làm việc nhóm 4 người với AI

Repository đã có **phân công theo vai trò A/B/C/D và prompt làm việc**, chưa gán tên
thành viên. Mốc M0 đang dựng nền chung; các bên cần review hợp đồng giao tiếp
trước khi phần phụ thuộc được triển khai song song.

| Tài liệu | Mục đích |
|---|---|
| [AGENTS.md](AGENTS.md) | Quy tắc AI phải đọc, phạm vi sửa và tiêu chí bàn giao |
| [Phân công và mốc tích hợp](docs/team-plan.md) | Vai trò 4 người, file chung, phụ thuộc và quy trình PR |
| [Prompt cho từng người](docs/ai-prompts.md) | Prompt bootstrap M0, prompt chung, A/B/C/D và kiểm tra tích hợp |
| [Hợp đồng giao tiếp](docs/contracts.md) | Vị trí định nghĩa hợp đồng v1, quy tắc ngữ nghĩa, trạng thái review |
| [Quyết định và vấn đề mở](docs/decisions.md) | Những điểm cần nhóm thống nhất |
| [Mẫu bàn giao](docs/handoffs/README.md) | Cách báo kết quả và đề nghị đổi hợp đồng |
| [Checklist tích hợp](docs/integration-checklist.md) | Điều kiện nghiệm thu theo từng mốc |

Mỗi người dùng checkout/worktree riêng. Dán prompt chung rồi prompt vai trò từ
`docs/ai-prompts.md`; không để bốn AI sửa đồng thời cùng một thư mục làm việc.

## Lệnh phát triển

Cần Node.js 24 LTS (≥ 24.11) và npm 11. Mọi lệnh chạy ở thư mục gốc.

| Lệnh | Việc |
|---|---|
| `npm install` | Cài phụ thuộc cho mọi gói (workspaces); CI dùng `npm ci` |
| `npm run lint` | ESLint, gồm luật chặn renderer và phần shared dùng cho renderer import Node.js |
| `npm run typecheck` | Kiểm tra kiểu toàn bộ mã nguồn và test (`tsc -p tsconfig.json`) |
| `npm test` | Vitest cho mọi gói; test trỏ thẳng vào mã nguồn, không cần build trước |
| `npm run build` | Build theo thứ tự `shared` → `croc-engine` → `server` (ra `dist/`) |
| `npm run check` | Chạy cả bốn lệnh trên, giống CI |

Chạy server ở máy (cần build trước):

```bash
cp apps/server/.env.example apps/server/.env   # sửa RELAY_ADDRESS, RELAY_PASS
npm run build
npm run cli -w @croc-classroom/server -- create-lecturer --username giangvien --full-name "Nguyễn Văn Giảng"
npm start -w @croc-classroom/server
```

Server tạo `apps/server/data/db/croc-classroom.sqlite` và áp dụng migration khi khởi động;
`GET /health` trả trạng thái. Đã có: tài khoản (đăng nhập, kích hoạt, nhập CSV, quản lý SV), `/me`,
`/config`, bài tập (tạo, sửa, xoá, thống kê), `/join`, nộp bài, biên nhận, danh sách và thu bài. Chưa có
dịch vụ vé của D nên tạo bài / nộp / thu trả 503; đặt `DEV_FAKE_TRANSFERS=true` trong `.env` để các lượt
truyền tự "thành công" mà không truyền file (chỉ để thử giao diện).

App desktop chưa chạy được: khung Electron do B dựng. Giao diện có thể làm trước với
`createMockCrocApi()` từ `@croc-classroom/shared/mocks`.

## Tính năng chính

- **Giao bài:** giảng viên tạo bài và nhận về một code phrase (ví dụ `sao-mai-xanh-042`) để đưa cho cả lớp.
- **Nhận bài:** sinh viên đăng nhập rồi nhập code. App nhận đề theo thứ tự ưu tiên: bạn cùng mạng LAN, rồi VPS, rồi bạn ở mạng khác qua Internet.
- **Chia sẻ lại:** sinh viên đã nhận và đã kiểm tra xong file sẽ tự động trở thành nguồn phát cho người đến sau.
- **Nộp bài:** đường đi sinh viên → VPS → giảng viên. Sinh viên nhận biên nhận; hệ thống ghi giờ nộp theo giờ VPS và đánh dấu nếu trễ hạn.
- **Đăng nhập:** giảng viên là admin. Tài khoản sinh viên do giảng viên tạo từ file CSV, sinh viên kích hoạt bằng mã một lần.
- **Toàn vẹn:** mọi file nhận về đều được kiểm tra SHA-256 theo manifest do server cung cấp.

## Kiến trúc tóm tắt

```
App Electron (GV/SV) ──HTTPS/WSS──► Caddy ─► Server điều phối (Node.js + SQLite) ─► VPS worker ─► /data
        │                                                                              │
        └──────────────── croc ──────────► croc relay riêng (9009–9013) ◄──── croc ───┘
App SV ◄── croc trực tiếp trong LAN ──► App SV
```

Chi tiết xem mục 5 của [tài liệu thiết kế](docs/system-design.md).

## Cấu trúc thư mục

Mỗi thư mục module có một `README.md` liệt kê việc cần làm.

| Thư mục | Nội dung |
|---|---|
| [`apps/desktop`](apps/desktop/README.md) | App Electron cho cả giảng viên và sinh viên |
| [`apps/desktop/src/main`](apps/desktop/src/main/README.md) | Tiến trình chính: API client, croc, chia sẻ lại, cache, IPC |
| [`apps/desktop/src/preload`](apps/desktop/src/preload/README.md) | Cầu IPC an toàn giữa tiến trình chính và giao diện |
| [`apps/desktop/src/renderer`](apps/desktop/src/renderer/README.md) | Giao diện React: các màn hình của giảng viên và sinh viên |
| [`apps/server`](apps/server/README.md) | Server điều phối |
| [`apps/server/src/accounts`](apps/server/src/accounts/README.md) | Đăng nhập, phiên, kích hoạt, nhập danh sách sinh viên |
| [`apps/server/src/assignments`](apps/server/src/assignments/README.md) | Bài tập, code phrase, manifest |
| [`apps/server/src/distribution`](apps/server/src/distribution/README.md) | Vé, chọn nguồn (phương án A), theo dõi seeder, WebSocket |
| [`apps/server/src/submissions`](apps/server/src/submissions/README.md) | Nộp bài, biên nhận, giảng viên thu bài |
| [`apps/server/src/vps-worker`](apps/server/src/vps-worker/README.md) | Chạy croc trên VPS, kho file |
| [`packages/shared`](packages/shared/README.md) | Kiểu dữ liệu, hợp đồng API/WebSocket, manifest, code phrase |
| [`packages/croc-engine`](packages/croc-engine/README.md) | Bọc croc CLI: gửi, nhận, tiến trình, huỷ, timeout |
| [`deploy`](deploy/README.md) | Docker Compose, Caddy, relay, cấu hình VPS |
| [`tests/e2e`](tests/e2e/README.md) | Kịch bản kiểm thử đầu–cuối nhiều máy |

## Thứ tự xây dựng

Nhóm làm theo các mốc M0–M5 trong [team-plan.md](docs/team-plan.md). Thứ tự kỹ thuật dưới đây
là gợi ý ban đầu của system-design mục 15.

1. [`packages/croc-engine`](packages/croc-engine/README.md) và [`packages/shared`](packages/shared/README.md).
2. [`deploy`](deploy/README.md): chạy relay và server rỗng trên VPS, **thử kết nối cổng relay từ mạng trường**.
3. [`apps/server`](apps/server/README.md): tài khoản, bài tập, VPS worker.
4. [`apps/desktop`](apps/desktop/README.md): đăng nhập, giảng viên tạo bài, sinh viên nhận đề từ VPS.
5. Chia sẻ lại: [`distribution`](apps/server/src/distribution/README.md) cùng phần seeder trong [`main`](apps/desktop/src/main/README.md).
6. Nộp bài và giảng viên thu bài: [`submissions`](apps/server/src/submissions/README.md).
7. Đóng gói cho ba hệ điều hành và [thử nghiệm thật một buổi học](tests/e2e/README.md).

## Yêu cầu môi trường

- Node.js 24 LTS, npm 11 (workspaces) — xem quyết định D-001.
- croc **10.7.0**, được khoá phiên bản và đóng gói kèm app.
- VPS chạy Docker và Docker Compose, có tên miền (dùng tên miền miễn phí như DuckDNS cũng được).
- Một máy Mac để build bản macOS.
