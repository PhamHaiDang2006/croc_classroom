# croc-classroom — Giao–Nộp bài tập qua croc

> Tên dự án tạm. Trạng thái: **mới có tài liệu thiết kế và danh sách việc cần làm, chưa có mã nguồn.**

Ứng dụng desktop (Electron) giúp **một giảng viên** giao bài cho sinh viên bằng **một code phrase duy nhất**
và nhận bài nộp. File được truyền bằng [croc](https://github.com/schollz/croc), có mã hoá đầu–cuối, qua relay
riêng đặt trên VPS. Sinh viên đã nhận đề sẽ tự chia sẻ lại cho bạn **cùng mạng LAN**.

## Tài liệu

- **[Thiết kế hệ thống](docs/system-design.md)**: yêu cầu, các phương án đã cân nhắc, kiến trúc, các luồng nghiệp vụ, bảo mật, dữ liệu, API, rủi ro.

## Làm việc nhóm 4 người với AI

Repository đã có **phân công theo vai trò A/B/C/D và prompt làm việc**, chưa gán tên
thành viên và chưa triển khai mã nguồn. Bắt đầu bằng mốc M0 để dựng nền chung và
review hợp đồng giao tiếp trước khi các phần phụ thuộc được triển khai song song.

| Tài liệu | Mục đích |
|---|---|
| [AGENTS.md](AGENTS.md) | Quy tắc AI phải đọc, phạm vi sửa và tiêu chí bàn giao |
| [Phân công và mốc tích hợp](docs/team-plan.md) | Vai trò 4 người, file chung, phụ thuộc và quy trình PR |
| [Prompt cho từng người](docs/ai-prompts.md) | Prompt bootstrap M0, prompt chung, A/B/C/D và kiểm tra tích hợp |
| [Danh mục hợp đồng](docs/contracts.md) | Các interface cần chốt; hiện chưa có hợp đồng v1 thực thi |
| [Quyết định và vấn đề mở](docs/decisions.md) | Những điểm cần nhóm thống nhất |
| [Mẫu bàn giao](docs/handoffs/README.md) | Cách báo kết quả và đề nghị đổi hợp đồng |
| [Checklist tích hợp](docs/integration-checklist.md) | Điều kiện nghiệm thu theo từng mốc |

Mỗi người dùng checkout/worktree riêng. Dán prompt chung rồi prompt vai trò từ
`docs/ai-prompts.md`; không để bốn AI sửa đồng thời cùng một thư mục làm việc.

## Tính năng chính

- **Giao bài:** giảng viên tạo bài và nhận về một code phrase (ví dụ `sao-mai-xanh-42`) để đưa cho cả lớp.
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

1. [`packages/croc-engine`](packages/croc-engine/README.md) và [`packages/shared`](packages/shared/README.md).
2. [`deploy`](deploy/README.md): chạy relay và server rỗng trên VPS, **thử kết nối cổng relay từ mạng trường**.
3. [`apps/server`](apps/server/README.md): tài khoản, bài tập, VPS worker.
4. [`apps/desktop`](apps/desktop/README.md): đăng nhập, giảng viên tạo bài, sinh viên nhận đề từ VPS.
5. Chia sẻ lại: [`distribution`](apps/server/src/distribution/README.md) cùng phần seeder trong [`main`](apps/desktop/src/main/README.md).
6. Nộp bài và giảng viên thu bài: [`submissions`](apps/server/src/submissions/README.md).
7. Đóng gói cho ba hệ điều hành và [thử nghiệm thật một buổi học](tests/e2e/README.md).

## Yêu cầu môi trường (dự kiến)

- Node.js LTS, npm hoặc pnpm (workspaces).
- croc **10.7.0**, được khoá phiên bản và đóng gói kèm app.
- VPS chạy Docker và Docker Compose, có tên miền (dùng tên miền miễn phí như DuckDNS cũng được).
- Một máy Mac để build bản macOS.
