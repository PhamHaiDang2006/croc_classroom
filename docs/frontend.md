# Frontend Croc Classroom

Frontend React nằm trong `apps/desktop/src/renderer`, dùng IPC v1 của shared.
Nhánh: `A-Frontend`. Đây là giao diện ứng dụng GV/SV, không phải trang quảng cáo.

## Chạy thử

Từ gốc repository (Node >= 24.11):

```powershell
npm ci --ignore-scripts
npm run dev -w @croc-classroom/desktop
```

Mở `http://127.0.0.1:5173`. Vite dùng source shared trực tiếp, không cần build shared
trước khi phát triển giao diện. Các chế độ xem thử:

- `/`: giảng viên đăng nhập sẵn.
- `/?role=student`: sinh viên; nhập mã mẫu `sao-mai-xanh-042`.
- `/?role=login`: màn hình đăng nhập/kích hoạt.
- `/?role=student&outcome=failed` hoặc `outcome=timeout`: thử lỗi truyền.
- Tài khoản mẫu: `giangvien / matkhau-gv-123`, `20210001 / matkhau-sv-123`.

Mock chỉ lưu trong bộ nhớ. Reload làm mất thao tác thử. Banner luôn ghi rõ dữ liệu
mẫu; nút chọn thư mục lấy payload giả, không đọc file thật. Thu bài, huỷ truyền,
tải lại đề và xoá cache bị vô hiệu hoá trong demo vì mock chưa mô phỏng đầy đủ.
Nhập CSV trả fixture cố định; không dùng để nhập dữ liệu thật.

## Kết nối với phần B

- Nếu có `window.croc`, giao diện dùng ngay API đó. Không chuyển sang mock khi API lỗi.
- `loadApi()` trong `api.ts` chỉ bật mock ở Vite dev hoặc build có `VITE_DEMO=true`.
- Build production mặc định cần preload; thiếu preload sẽ hiện thông báo rõ, không
  tự đăng nhập giả hoặc báo truyền file thành công.
- `npm run build -w @croc-classroom/desktop` tạo `apps/desktop/dist/renderer`.
  B tích hợp index.html này vào Electron BrowserWindow, giữ contextIsolation/sandbox.
- Renderer không gọi HTTP/WS, fs, Electron hoặc croc trực tiếp. Hợp đồng IPC không đổi.
- Transfer theo operationId, gồm chờ nguồn/xếp hàng/xác minh/lỗi/timeout. Không hiển thị
  đã nộp chỉ vì progress 100%; biên nhận lấy từ `student.getReceipt`.
- Các subscription transfer/assignment/session/connection được huỷ khi unmount.

## Phạm vi giao diện

- Đăng nhập hai vai trò, kích hoạt SV, đăng xuất, cấu hình địa chỉ server khi đăng nhập.
- GV: tìm/chọn bài, tạo bài từ selectionId, hiển thị/copy mã sau phát hành, danh sách
  file, hạn nộp, bảng bài nộp, xác nhận xoá, quản lý SV, nhập CSV/xuất mã kích hoạt.
- SV: tham gia bằng mã, nhận đề, mở thư mục, chọn bài làm, gửi bài và xem biên nhận.
- Cài đặt: chọn thư mục, bật/tắt seeding, số lượt chia sẻ, xác nhận xoá cache.
- Trạng thái tải/rỗng/lỗi, dialog có focus và Escape, bố cục desktop/mobile, reduced motion.

## Kiểm thử

```powershell
npm run check
# Windows có Edge:
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:ui -w @croc-classroom/desktop
```

Máy không có Edge: cài browser bằng `npx playwright install chromium`, không đặt
PLAYWRIGHT_CHANNEL rồi chạy test:ui. CI cài Chromium và chạy test giao diện sau build.
Không chạy build shared và test UI dùng package build đồng thời; Vite hiện đã alias
shared vào source để tránh phụ thuộc thư mục dist đang bị thay.

Playwright kiểm tra tạo bài, đăng nhập sai/đúng, nhận/nộp, thất bại không có biên nhận,
quản lý SV, cài đặt, xác nhận xoá, lỗi bridge thật, mobile/logout và tràn ngang.
Đây là E2E giao diện với mock IPC, chưa phải E2E truyền file thật.

## Đối chiếu 20 tiêu chí thiết kế

Không có giao diện trước đó: không thể tạo ảnh before trung thực. Ảnh frontend mới
nằm trong `docs/screenshots/`, được chụp bằng test trên trình duyệt.

| Tiêu chí cần tránh | Cách áp dụng |
|---|---|
| Gradient tím hoặc chuyển sắc | Nền trung tính #f5f5ef, xanh lớp học #365e3f; không gradient |
| Chữ gradient | Toàn bộ chữ màu đặc |
| Glow màu | Độ sâu từ surface và border 10%; không glow |
| Blob/orb bóng | Không sử dụng |
| Emoji trong nhãn/nav | Nhãn văn bản, ký hiệu đơn sắc và logo SVG |
| Pill badge trên headline | Không có badge quảng cáo |
| Headline dùng cho mọi sản phẩm | Headline nói về giao bài/lớp học |
| Hype/exclamation | Nội dung nghiệp vụ, không số liệu tiếp thị hoặc lời cường điệu |
| Mọi thứ căn giữa | Sidebar, danh sách, bảng và nội dung căn trái |
| Nhiều primary CTA | Một CTA chính theo màn hình/trạng thái; dialog modal làm nền inert |
| Review/user count không nguồn | Không có testimonial; số bài/sinh viên từ IPC, mock được gắn nhãn |
| Spacing ngoài lưới | Khoảng cách/padding theo 4, 8, 12, 16, 24, 32, 48, 64, 96 |
| Mọi thứ bo tròn hoàn toàn | Card 12–16px; button/input 8px; không capsule |
| Một sans weight 800 | Be Vietnam Pro đóng gói cục bộ, chỉ 400/500 |
| Stat banner số không đo | Không có banner thống kê marketing |
| Nhãn uppercase tracking rộng | Sentence case, không uppercase hoặc tracking rộng |
| Icon tile ở mọi card | Card bài tập dùng tên, trạng thái, hạn; không icon tile |
| Feature card giống nhau mơ hồ | Danh sách bài tập thật theo DTO, không feature quảng cáo |
| Bounce/pulse tự chạy | Không animation tự chạy; hover/focus 160ms ease-out, tôn trọng reduced motion |
| Thiếu điểm nhấn sản phẩm | Panel mã giao bài màu xanh sáng, copy được và chỉ hiện khi phát hành |

## Chưa kiểm chứng

Electron main/preload, worker và engine croc thật vẫn thuộc B/D. Chưa kiểm chứng
đăng nhập backend qua desktop, file thật, VPS/LAN hoặc bộ cài. Chưa chạy bộ UI trên
macOS/Linux tại máy này; CI cấu hình không đồng nghĩa CI đã chạy.
