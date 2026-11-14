# Prompt cho nhóm 4 người làm việc cùng AI

## Cách dùng

1. Một người chạy prompt **M0 — Chuẩn bị nền chung**, cả nhóm review và đưa nền vào nhánh chung.
2. Mỗi người dùng checkout/worktree riêng, cùng xuất phát từ nền M0.
3. Dán **prompt chung**, rồi **prompt vai trò** và mốc muốn thực hiện.
4. Kết thúc mốc bằng bàn giao và prompt kiểm tra tích hợp.

Các prompt yêu cầu thực hiện công việc tương lai. Việc có file này không có nghĩa
workspace, hợp đồng hay tính năng đã được triển khai. Không chạy cả bốn vai trò
đồng thời trên cùng một thư mục làm việc.

## M0 — Chuẩn bị nền chung

```text
Bạn đang làm việc trong repository croc_classroom, dự án Electron + Node.js +
SQLite sử dụng croc để giao và nộp bài. Đọc AGENTS.md và toàn bộ tài liệu trước.

Nhiệm vụ: chuẩn bị nền để 4 người sử dụng AI coding agent có thể triển khai
song song và tích hợp được. Không triển khai toàn bộ tính năng nghiệp vụ.

Vai trò:
- A: renderer.
- B: main, preload, croc-engine và đóng gói desktop.
- C: khung server, DB, accounts, assignments, submissions.
- D: distribution, VPS worker, deploy và điều phối E2E.

Bạn được khởi tạo khung các package trong bước bootstrap. Sau M0, quyền sửa
module tuân theo team-plan. Giữ lại tài liệu hiện có và cập nhật theo thực tế.

Thực hiện:
1. Đối chiếu AGENTS.md, team-plan.md, contracts.md và decisions.md.
   Không tự gán tên thành viên hay thời hạn khi chưa có thông tin.
2. Chốt đề xuất hợp đồng v1 trong packages/shared và docs/contracts.md:
   - REST: request/response, schema runtime, quyền, HTTP status, mã lỗi.
   - WebSocket: xác thực, payload, tương quan yêu cầu/kết quả, reconnect.
   - IPC: API có kiểu, sự kiện, unsubscribe và kiểm tra đầu vào.
   - croc-engine và interface nội bộ giữa nghiệp vụ, dịch vụ vé, worker.
   - Manifest, payload, đường dẫn, UTC và version bài nộp.
   - Vòng đời vé, bên có quyền xác nhận, timeout/huỷ, xử lý lặp và restart.
   Tách phần shared dùng được trong renderer khỏi phần phụ thuộc Node.js.
3. Xử lý danh mục còn thiếu trong contracts.md, gồm retry tải đề, truy vấn
   biên nhận sau reconnect, thông báo xoá/phát hành và thu đúng version.
4. Khởi tạo workspace tối thiểu: một package manager, TypeScript, khung
   desktop/server/shared/engine, build/lint/typecheck/test, .gitignore,
   .env.example và CI. Chưa cần tính năng nghiệp vụ hoàn chỉnh.
5. Tạo fixture và mock đúng interface để các vai trò làm độc lập.
6. Ghi lệnh thực tế vào README, cập nhật checklist M0 và quyết định kỹ thuật.

Ưu tiên thiết kế tối thiểu đủ phạm vi; không thêm framework hoặc tính năng
không cần thiết. Chỗ chưa rõ, ghi quyết định và lý do. Nếu thay đổi yêu cầu
đã chốt, đánh dấu cần nhóm xác nhận và tiếp tục việc không bị chặn.

Chạy kiểm tra khả dụng. Báo cáo thay đổi, lệnh/kết quả, mock so với tích hợp
thật, phần chưa xác minh và những hợp đồng cần các bên review trước khi
nhóm bắt đầu triển khai phụ thuộc. Không tự coi review đã hoàn thành.
```

## Prompt chung — dán trước prompt vai trò

```text
Đọc AGENTS.md, docs/system-design.md, docs/team-plan.md, docs/contracts.md,
docs/decisions.md, README module và bàn giao của các bên liên quan.

Làm đúng phạm vi được giao và hợp đồng đã chốt:
- Dùng kiểu/schema chung; không sao chép DTO, mã lỗi và tên sự kiện.
- Không tự đổi REST, WebSocket, IPC, engine hoặc interface worker.
- Nếu thiếu/sai hợp đồng, ghi docs/handoffs/<vai-tro>-contract-requests.md:
  lý do, old/new, bên ảnh hưởng, tương thích/migration và cách kiểm chứng.
  Tiếp tục việc không bị chặn; không tự xem đề xuất là đã được duyệt.
- Không sửa module người khác hoặc file chung ngoài quyền phụ trách.
- Mock dùng đúng interface và fixture chung, tách khỏi chế độ thật.
- Không báo hoàn tất luồng thực tế khi mới chạy mock hoặc còn TODO.
- Xử lý lỗi liên quan, chạy kiểm tra phù hợp, ghi chính xác kết quả.
- Không thêm tính năng ngoài thiết kế hoặc tự spawn sub-agent.

Nếu M0 chưa đủ cho phần phụ thuộc, báo rõ điểm thiếu; chỉ làm việc độc lập
không cần tự bịa hợp đồng. Nếu chưa chỉ định mốc, chọn mốc chưa hoàn thành
sớm nhất có đủ điều kiện theo team-plan.

Triển khai theo mốc nhỏ kiểm chứng được, không chỉ trả về kế hoạch.
Kết thúc cập nhật docs/handoffs/<vai-tro>.md theo mẫu, gồm phần đã làm,
interface cung cấp/sử dụng, cách chạy, kiểm chứng mock/thật, vấn đề còn lại
và việc bên khác cần thực hiện.
```

## A — Giao diện

```text
Bạn phụ trách A: apps/desktop/src/renderer. Thực hiện mốc đã chỉ định hoặc
mốc sớm nhất đủ điều kiện theo team-plan.

Xây dựng giao diện tiếng Việt cho GV/SV:
- Chung: đăng nhập, kích hoạt, cài đặt.
- SV: nhập code, danh sách bài, nhận đề, nộp bài, biên nhận.
- GV: quản lý SV/CSV, tạo bài, code phrase, thống kê, thu bài.

Chỉ gọi API preload. Không gọi HTTP/WS trực tiếp, không dùng fs/child_process,
không chạy croc. Không sửa main/preload/server. Khi B chưa xong, dùng mock
IPC đúng hợp đồng, không tự mở API mới.

Yêu cầu:
- Hiển thị chờ, đang truyền, xác minh, thành công, thất bại, timeout và offline.
- Chỉ báo nộp thành công khi có biên nhận server, không dựa vào progress 100%.
- Huỷ đăng ký listener đúng vòng đời để tránh nhận sự kiện trùng.
- Kiểm tra tương tác quan trọng; phối hợp B kiểm chứng luồng thật mỗi mốc.
- Hỗ trợ hướng dẫn cài và kiểm tra bộ cài; B quản lý cấu hình đóng gói.

Bàn giao renderer, các kiểm tra đã chạy, danh sách IPC sử dụng và tình huống
đã kiểm chứng; phân biệt rõ mock với tích hợp thật.
```

## B — Electron và truyền file

```text
Bạn phụ trách B: desktop main/preload, croc-engine, khung và đóng gói desktop.
Thực hiện mốc đã chỉ định hoặc mốc sớm nhất đủ điều kiện theo team-plan.

Triển khai API/WS client, phiên/cài đặt, IPC có kiểu, engine send/receive,
progress/cancel/timeout, cache, seeder, giao/nhận/nộp/thu bài và bộ cài.

Ranh giới:
- Renderer không nhận secret nếu không cần; kiểm tra tham số IPC tại main.
- Chỉ croc-engine chạy và đọc đầu ra croc.
- Không sửa backend hoặc tự đổi interface engine D đang sử dụng.
- Nhận vào thư mục tạm, xác minh manifest trước khi đưa vào kho/cache.

Ưu tiên cung cấp sớm preload/mock adapter cho A và engine có kiểm thử
tích hợp cho D, rồi ghép backend theo từng mốc.

Kiểm chứng timeout, huỷ không sót tiến trình, file tiếng Việt, sai manifest,
reconnect và đường dẫn binary trong bản đóng gói. Không coi có cấu hình
build là đã chạy được trên mọi nền tảng.

Bàn giao ví dụ IPC cho A, engine cho D, lệnh kiểm tra và danh sách nền tảng
đã build/chạy thực tế so với nền tảng chưa xác minh.
```

## C — Backend nghiệp vụ

```text
Bạn phụ trách C: khung server, DB/migration, accounts, assignments,
submissions; quản lý file gốc và shared theo quy trình review của nhóm.
Thực hiện mốc đã chỉ định hoặc mốc sớm nhất đủ điều kiện theo team-plan.

Triển khai xác thực, phân quyền, phiên, kích hoạt/CSV, bài tập/join,
nộp bài/version/biên nhận/thu bài, cấu hình, log an toàn và healthcheck.

Ranh giới:
- Không trực tiếp chạy croc.
- Gọi dịch vụ vé và worker theo interface thống nhất với D.
- Không tạo thêm hệ thống vé, hàng đợi hoặc WS trùng với D.
- Không xác nhận VPS đã lưu file chỉ dựa trên báo cáo client.

Kiểm thử quyền truy cập bài nộp, nộp đồng thời, yêu cầu lặp, thu đúng version,
bản mới lỗi giữ bản cũ và phối hợp huỷ lượt truyền khi xoá bài.

Cung cấp fixture, ví dụ request/response, adapter giả đúng interface của D
để test nghiệp vụ độc lập. Khi D sẵn sàng, kiểm chứng tích hợp thật.

Không tự duyệt thay đổi shared ảnh hưởng A/B/D. Ghi đề xuất và lấy review
từ bên sử dụng trước khi cập nhật nền chung. Bàn giao lệnh và kết quả thật.
```

## D — Điều phối, VPS và tích hợp

```text
Bạn phụ trách D: distribution, vps-worker, deploy và điều phối tests/e2e.
Thực hiện mốc đã chỉ định hoặc mốc sớm nhất đủ điều kiện theo team-plan.

Triển khai dịch vụ vé chung, chọn nguồn LAN → VPS → peer Internet → hàng đợi,
WS/seeder online, timeout/huỷ/reconnect, worker dùng engine B, kho file/thư mục
tạm, giới hạn tiến trình/dung lượng và Docker/Caddy/relay/backup/khôi phục.

Ranh giới:
- Dùng xác thực và dữ liệu nghiệp vụ qua interface của C.
- Không tạo hệ thống đăng nhập, schema DB hoặc DTO trùng; phối hợp C về migration.
- Không chạy croc ngoài croc-engine.
- Chính sách báo cáo hash sai phải được chốt; không tự coi cáo buộc client
  là bằng chứng chắc chắn để cấm nguồn.

Kiểm chứng yêu cầu đồng thời không vượt slot, giải phóng đúng một lần,
restart/reconnect không treo vé, worker xác minh trước khi báo thành công.
Phân biệt test mô phỏng chọn LAN với truyền LAN thật.

Cung cấp môi trường tích hợp và chạy checklist từng mốc. Lỗi module nào
bàn giao đúng chủ module đó, không tự sửa toàn repository để làm test xanh.
Báo cáo bước tái hiện, môi trường, kết quả và phần chưa có điều kiện kiểm tra.
```

## Kiểm tra tích hợp sau mỗi mốc

```text
Đọc AGENTS.md, docs/contracts.md, docs/integration-checklist.md và bàn giao
A/B/C/D. Đối chiếu thay đổi của mốc hiện tại với hợp đồng.

Kiểm tra chuỗi renderer → preload → main → REST/WS → server → worker → engine.
Tìm sai khác tên hàm, kiểu, payload, trạng thái, mã lỗi, quyền, version và
thứ tự xử lý bất đồng bộ. Xác định phần mock đang che khuất phụ thuộc thật.

Chạy kiểm tra hiện có và luồng tích hợp khả dụng. Không dùng mock để kết luận
truyền file thật đã hoạt động. Không đánh dấu checklist khi thiếu bằng chứng.

Mỗi vấn đề ghi vị trí/bằng chứng, ảnh hưởng, vai trò chịu trách nhiệm,
cách sửa và tiêu chí kiểm chứng. Chỉ sửa trong phạm vi được giao.
Kết luận mốc đã đạt hay chưa, những điều chưa xác minh và ai cần làm tiếp.
```
