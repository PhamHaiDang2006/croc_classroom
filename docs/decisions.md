# Quyết định và vấn đề đang mở

Yêu cầu nghiệp vụ gốc nằm trong `system-design.md`. Tài liệu phối hợp không tự động
thay đổi các yêu cầu đã chốt ở đó.

## Quy ước phối hợp được đề xuất cho nhóm

- Bốn vai trò A/B/C/D theo `team-plan.md`; chưa gán tên thành viên.
- Chốt hợp đồng và dựng nền chung ở M0 trước khi triển khai song song phần phụ thuộc.
- C quản lý cấu hình gốc/shared; bên sử dụng cùng review thay đổi interface.
- Kiểm chứng bằng mock và tích hợp thật phải báo cáo riêng.

## Cần chốt ở M0

| Vấn đề | Người điều phối | Trạng thái |
|---|---|---|
| Tên thành viên, thời hạn và người tích hợp/review thực tế | Nhóm | Chưa chốt |
| Package manager, phiên bản công cụ, schema library, test runner | C, phối hợp B/D | Chưa chốt |
| Hợp đồng v1 REST/WS/IPC/engine/worker | C, phối hợp A/B/D | Chưa chốt |
| Vòng đời vé và phục hồi sau restart | D, phối hợp B/C | Chưa chốt |
| Nộp lại đồng thời, lưu version và xác nhận thu bài | C, phối hợp B/D | Chưa chốt |
| Chính sách xử lý báo cáo hash sai và mật khẩu relay lộ | D, phối hợp C | Cần review thay đổi thiết kế |
| Quy tắc file đa nền tảng và manifest hash tổng | B, phối hợp C/D | Chưa chốt |
| Máy Mac, VPS, mạng trường và tiêu chí hiệu năng | Nhóm | Chưa xác nhận môi trường |

## Mẫu ghi một quyết định

- Mã / ngày / trạng thái: đề xuất, đã thống nhất hoặc thay thế.
- Vấn đề và bằng chứng.
- Phương án chọn, lý do và đánh đổi.
- Module và bên sử dụng bị ảnh hưởng.
- Người đề xuất và người review.
- Hợp đồng/migration/kiểm thử cần cập nhật.

Không đánh dấu “đã thống nhất” chỉ vì một AI tự chọn phương án ảnh hưởng cả nhóm.
