# tests/e2e

Kiểm thử đầu–cuối với server, relay và nhiều app (hoặc client chạy không giao diện) cùng lúc.

Thiết kế: mục 2 (chống mục tiêu), 7, 14 và 15 trong [system-design.md](../../docs/system-design.md).

## Trạng thái

Chưa có harness E2E truyền file của ứng dụng. E2E cần server, croc-engine thật
và client không giao diện từ các vai trò C/B; D điều phối môi trường/kịch bản
nhưng chủ module sửa lỗi thuộc phần mình.

`node --test tests/e2e/deploy.test.mjs` kiểm tra cấu hình Compose qua Docker
Compose CLI với giá trị giả; không cần Docker daemon. Đây là test cấu hình,
không phải E2E hoặc test relay thật.

## Phụ thuộc trước khi tự động hóa

- Shared v1 chốt ticket ID, trạng thái, lỗi, correlation và quy tắc retry.
- Worker cung cấp kiểm soát được giới hạn đồng thời, timeout, huỷ và fixture file.
- Server có cấu hình test cô lập, reset dữ liệu an toàn và tài khoản fixture.
- Client test dùng đúng interface main/croc-engine; không tự tạo giao thức mock
  riêng hoặc dùng mock để tuyên bố đã xác minh truyền file thật.
- Mỗi kết quả ghi commit, lệnh, môi trường và phân biệt unit/mock, local relay,
  VPS/mạng thật.

## Bộ tình huống vé và worker cần tự động hóa

Dùng interface và fixture v1 sau khi review; không xem `FakeTicketIssuer` của C là
implementation của D. Các kịch bản sau **chưa có test D**, và chưa được đánh dấu đạt:

| Tình huống | Kết quả cần kiểm tra |
|---|---|
| Hai yêu cầu nộp cùng SV/bài | Vé mới thay vé cũ; callback vé cũ không tạo phiên bản. |
| Thu bài của hai SV cùng lúc | Hai vé khác phiên bản không huỷ lẫn nhau. |
| Vé nộp đã commit, callback lặp | Cùng biên nhận, không thêm version hoặc dọn file đang dùng. |
| Kết quả đến sau timeout/huỷ | Không commit hoặc phát hành sai; slot được giải phóng đúng một lần. |
| Thu v1 trong khi v2 được commit | File v1 còn đến khi lượt thu kết thúc; sau đó dọn được an toàn. |
| Queue FIFO, VPS đầy, seeder rảnh/bận | Đúng thứ tự chọn nguồn, không vượt slot; huỷ không làm kẹt hàng đợi. |
| `serve.accept` muộn hoặc lặp | Không cấp lại slot, không đánh thức sai vé. |
| Restart và reconnect | Vé chưa kết thúc được huỷ theo hợp đồng; dọn tạm và đồng bộ lại, không giữ slot mãi. |
| Manifest sai hoặc vượt giới hạn nhận | Không đưa file chưa xác minh vào kho, dọn file tạm. |
| Xoá bài đồng thời có lượt truyền | Không còn lượt/vé/file phát sinh sau khi xoá hoàn tất; retry và restart an toàn. |

## Việc cần làm

- [ ] Môi trường kiểm thử:
  - [ ] Docker Compose chạy server và relay trên máy cục bộ.
  - [ ] Nhiều client: dùng các module trong [`apps/desktop/src/main`](../../apps/desktop/src/main/README.md), chạy không giao diện.
  - [ ] Giả lập được IP công khai và subnet LAN cho từng client.

## Kịch bản

- [ ] Giảng viên tạo bài. Code phrase chỉ dùng được sau khi VPS đã xác minh đề.
- [ ] Sinh viên 1 nhận đề từ VPS. Sinh viên 2 cùng LAN nhận từ sinh viên 1.
- [ ] Hai máy cùng IP công khai nhưng khác subnet thì **không** được ghép là cùng LAN.
- [ ] File từ seeder sai manifest: phát hiện và fallback; chỉ loại/cấm nguồn theo chính sách có bằng chứng đã được duyệt.
- [ ] Seeder tắt máy giữa chừng: vé hết hạn, sinh viên nhận lại từ nguồn khác.
- [ ] VPS đã đầy phiên: dùng seeder qua Internet, hoặc xếp hàng rồi nhận được `ticket.ready`.
- [ ] Giảng viên tắt app: sinh viên vẫn nhận đề và nộp bài được.
- [ ] Nộp bài, nộp lại, nộp trễ, nộp vượt dung lượng; biên nhận đúng.
- [ ] Giảng viên mở app thì tự tải về bản nộp mới nhất của từng sinh viên.
- [ ] Sinh viên không xem hay tải được bài nộp của người khác.
- [ ] Tên file tiếng Việt có dấu truyền qua lại giữa Windows, macOS và Linux vẫn xác minh đúng.

## Thử nghiệm thật

- [ ] Thử trong một buổi học thật: một nhóm sinh viên ở lớp, một nhóm ở nhà.
- [ ] Đo thời gian phát đề cho cả lớp.
- [ ] Đo tỉ lệ sinh viên nhận đề qua LAN.
- [ ] Ghi lại lỗi gặp phải.

## Tiêu chí báo cáo

Không đánh dấu đạt các kịch bản LAN, firewall, VPS, nhiều hệ điều hành hoặc tải
thật khi chỉ dùng mock/container trên cùng máy. Ghi rõ kịch bản chưa chạy và lý do
trong bàn giao D; giao lỗi chức năng về đúng chủ module theo `team-plan.md`.
