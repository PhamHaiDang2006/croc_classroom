# Bàn giao giữa các vai trò

Mỗi vai trò tạo file `A.md`, `B.md`, `C.md` hoặc `D.md` khi có kết quả thực tế.
Chưa có các file này nghĩa là chưa có báo cáo bàn giao, không phải đã hoàn thành.

## Mẫu bàn giao

```markdown
# Bàn giao vai trò <A/B/C/D>

- Mốc:
- Branch / commit hoặc PR (nếu có):
- Phiên bản hợp đồng đang sử dụng:

## Đã làm
- Module và file thay đổi; hành vi cung cấp.

## Giao tiếp
- Interface đang cung cấp, bên sử dụng.
- Interface đang sử dụng, bên cung cấp.

## Kiểm chứng
| Lệnh hoặc kịch bản | Môi trường | Kết quả | Mock hay thật |
|---|---|---|---|

## Cách chạy
- Điều kiện, cấu hình mẫu và lệnh chính xác; không ghi secret thật.

## Còn thiếu / đang bị chặn
- Vấn đề, ảnh hưởng, người phụ trách, tiêu chí để gỡ chặn.

## Yêu cầu bên khác
- Việc cần làm, interface liên quan và cách xác nhận hoàn thành.
```

Đề xuất đổi hợp đồng đặt trong `<vai-tro>-contract-requests.md`, ghi rõ old/new,
lý do, bên bị ảnh hưởng, tương thích/migration, cách kiểm chứng và trạng thái review.
