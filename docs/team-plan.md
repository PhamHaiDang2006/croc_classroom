# Kế hoạch nhóm 4 người làm việc cùng AI

Trạng thái: phương án phân công theo vai trò; nhóm chưa điền tên thành viên.
Chưa triển khai mã nguồn. Các mốc dưới đây chưa được nghiệm thu.

## Phân công và bàn giao

| Vai trò / tên | Phạm vi | Bàn giao chính | Bên review/phối hợp |
|---|---|---|---|
| A / chưa điền | Renderer React | Màn hình GV/SV, trạng thái UI, kiểm thử tương tác | B review IPC; C đối chiếu nghiệp vụ |
| B / chưa điền | Main, preload, croc-engine, khung desktop và bộ cài | IPC, API/WS client, cache, seeder, engine truyền file | A dùng IPC; D dùng engine |
| C / chưa điền | Khung server, DB/migration, accounts, assignments, submissions | REST, phân quyền, dữ liệu và biên nhận | B dùng REST; D phối hợp vé/worker |
| D / chưa điền | Distribution, VPS worker, deploy, E2E | Vé, nguồn phát, hàng đợi, kho file, môi trường tích hợp | B phối hợp engine/WS; C phối hợp nghiệp vụ |

B có phạm vi nặng. A hỗ trợ hướng dẫn cài và kiểm tra bộ cài; thay đổi cấu hình
đóng gói vẫn do B quản lý. Mỗi người viết và chạy kiểm thử của phần mình.

## File chung và điểm giao nhau

| Thành phần | Người quản lý | Quy tắc |
|---|---|---|
| Cấu hình gốc, workspace, lockfile, CI, README gốc | C | B/D cung cấp yêu cầu build/deploy; tránh sửa đồng thời |
| `packages/shared`, `docs/contracts.md` | C | B định nghĩa IPC; D định nghĩa WS/vé/worker; bên sử dụng cùng review |
| `packages/croc-engine` | B | D review interface và kiểm chứng trên VPS |
| CSDL/migration | C | D yêu cầu thay đổi schema qua C, không tạo hệ thống dữ liệu trùng |
| Khung desktop, preload | B | A không tự mở IPC mới ngoài hợp đồng |
| Khung server | C | D tích hợp module qua interface đã chốt |
| `docs/decisions.md`, kế hoạch nhóm | C điều phối | Mỗi quyết định ghi người đề xuất, bên ảnh hưởng và trạng thái |
| `tests/e2e` | D | Chủ module sửa lỗi module; D quản lý kịch bản chung |

Vai trò quản lý không có nghĩa được tự đổi hợp đồng của các bên khác.
Quyền bootstrap cho phép tạo khung các package; sau bootstrap áp dụng ranh giới module.

## Mốc tích hợp

| Mốc | Kết quả nghiệm thu | A | B | C | D |
|---|---|---|---|---|---|
| M0 — Nền chung | Workspace chạy kiểm tra được; hợp đồng v1 và mock thống nhất | Review IPC/UI | Chốt IPC/engine | Chủ trì bootstrap, REST/schema | Chốt WS/vé/worker; thử relay |
| M1 — Tài khoản | SV kích hoạt, đăng nhập thật; phân quyền đúng | Màn hình tài khoản | IPC/client/token | Auth, CSV, phiên | Môi trường server/relay |
| M2 — Giao và nhận | GV phát hành sau xác minh; SV nhận đúng file từ VPS | Tạo/nhận bài | Truyền file, cache | Bài tập, join | Worker và vé VPS |
| M3 — Nộp và thu | SV có biên nhận; GV thu đúng bản mới nhất | Nộp/biên nhận/thống kê | Nộp và tự thu | Version, biên nhận, phân quyền | Vé/worker nộp và thu |
| M4 — Chia sẻ lại | LAN, fallback, hàng đợi, timeout/reconnect | Trạng thái và cài đặt | Seeder desktop | Dữ liệu và quyền liên quan | Chọn nguồn/WS/hàng đợi |
| M5 — Phát hành thử | Bộ cài, thử nhiều máy và ba hệ điều hành | Kiểm tra UI/hướng dẫn | Đóng gói | Kiểm tra dữ liệu/nghiệp vụ | Deploy, khôi phục, E2E |

Không bỏ chia sẻ lại hoặc ba hệ điều hành khỏi phạm vi đã chốt. Các mốc chỉ sắp
xếp thứ tự triển khai. Điền thời hạn sau khi nhóm xác nhận năng lực và lịch làm.

## Quy trình thực tế

1. Một người chạy prompt bootstrap trong `ai-prompts.md`; cả nhóm review nền chung.
2. Merge M0 vào nhánh chung; mỗi người tạo checkout/worktree và branch riêng từ đó.
3. Cả nhóm ưu tiên cùng một mốc. Có thể làm trước việc độc lập bằng mock đúng hợp đồng.
4. Mở PR nhỏ có phạm vi, cách kiểm tra và giới hạn. Bên sử dụng interface review thay đổi.
5. D chạy checklist tích hợp; lỗi giao lại đúng chủ module.
6. Cập nhật bàn giao và kết quả nghiệm thu; đồng bộ nhánh chung trước mốc tiếp theo.

Đổi hợp đồng: đề xuất → review bởi người quản lý và bên sử dụng → merge hợp đồng
→ cập nhật nhánh phụ thuộc → triển khai. Không để mỗi AI tự đặt một interface riêng.

## Tiêu chí hoàn thành

- Đúng yêu cầu và hợp đồng; không còn TODO cản trở luồng của mốc.
- Kiểm tra phù hợp chạy qua, có lệnh và kết quả trong bàn giao.
- Mock và tích hợp thật được ghi riêng; thiếu máy/mạng không được đánh dấu đã đạt.
- Lỗi và phụ thuộc còn lại có người chịu trách nhiệm.
- Dùng `integration-checklist.md` để nghiệm thu, không chỉ nhìn giao diện.
