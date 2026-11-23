# Nuddle+

Mạng xã hội nhỏ theo phong cách Google+ 2015: thanh đỏ, bảng tin dạng thẻ, hashtag xanh, +1, Circle.
Viết bằng HTML/CSS/JavaScript thuần (không cần build), dữ liệu và đăng nhập dùng Supabase.

**Bản đang chạy: https://nuddle-fykfju.freebuff.site**

## Các tệp

| Tệp | Nội dung |
| --- | --- |
| `index.html` | Toàn bộ khung trang: thanh trên, sidebar, bảng tin, Circles, hộp đăng nhập, khung camera |
| `styles.css` | Giao diện theo ảnh Google+ 2015 + giao diện điện thoại |
| `app.js` | Logic: đăng bài, +1, bình luận, tìm kiếm, Circles, camera, đăng nhập/đăng ký |
| `config.js` | Địa chỉ và khóa công khai của Supabase |
| `avatar-placeholder.svg` | Ảnh đại diện mặc định khi tạo tài khoản |
| `supabase-schema.sql` | Toàn bộ bảng, quyền, kho ảnh, Circles để sao lưu hoặc dựng lại |

## Chạy thử trên máy

Mở thư mục này rồi chạy một máy chủ tĩnh bất kỳ, ví dụ:

```bash
python3 -m http.server 8080
```

Rồi mở `http://localhost:8080`. Mở thẳng tệp `index.html` bằng trình duyệt cũng chạy được, nhưng camera trên điện thoại cần `https` hoặc `localhost`.

## Đã tạo trên Supabase

Project **ThongFamliy's Project** (`cuivzzfegzezmctjkdfi`). Mọi bảng đều có tiền tố `nuddle_` để không đụng bảng `profiles`, `user_roles` và “Family Database” của ứng dụng khác dùng chung project.

| Bảng | Nội dung |
| --- | --- |
| `nuddle_profiles` | hồ sơ người dùng: tên hiển thị, màu avatar, ảnh đại diện (`avatar_url`) |
| `nuddle_posts` | bài viết: nội dung, cộng đồng, tác giả, thời gian, ảnh (`image_url`) |
| `nuddle_likes` | lượt +1 (mỗi người một lượt cho mỗi bài) |
| `nuddle_comments` | bình luận |
| `nuddle_circles` | Circles: các vòng tròn do từng người tự tạo (chỉ chủ tài khoản thấy) |
| `nuddle_circle_members` | ai thuộc vòng tròn nào |

Ảnh nằm trong kho `nuddle-media` (Storage): ai cũng xem được ảnh, nhưng chỉ đăng nhập mới tải lên được và mỗi người chỉ ghi trong thư mục mang id của mình. Ảnh được thu nhỏ còn tối đa 1600px trước khi gửi, giới hạn 5 MB/tệp.

## Bảo mật

Row Level Security đã bật trên cả 6 bảng (riêng `nuddle_circles` và `nuddle_circle_members` là dữ liệu riêng tư: chỉ chủ tài khoản đọc/ghi được):

- Ai cũng **đọc** được bảng tin.
- Chỉ **ghi** được dữ liệu mang tên mình (`auth.uid() = author_id` / `user_id`).
- Chỉ **xoá** được bài và bình luận của chính mình.

Đã kiểm tra: gọi API bằng `anon key` mà không đăng nhập thì insert bị chặn (401, RLS violation). Nên nhúng `anon key` vào `config.js` là an toàn; **không bao giờ** đặt `service_role key` ở đó.

## Tạo tài khoản

1. Mở trang Nuddle+.
2. Nhập email + mật khẩu → **Tạo tài khoản**.
3. Project này đã **tắt xác nhận email**, bấm Tạo tài khoản là vào thẳng (không cần mở hộp thư).
   Lưu ý: cấu hình email (SMTP) cũ trong project đang sai nên chức năng “quên mật khẩu” sẽ không gửi được thư cho tới khi thay bằng dịch vụ gửi thư đúng chuẩn.
4. Đăng bài, +1, bình luận, tạo Circles.

## Circles

Mỗi người có các vòng tròn riêng (Gia đình, Bạn thân, Đồng nghiệp…). Vào mục **Circles** ở sidebar để tạo vòng, thêm người khác vào vòng hoặc bỏ ra. Chỉ chủ tài khoản nhìn thấy các vòng của mình.

## Ghi chú

- Bảng tin tải 60 bài mới nhất, chưa tự cập nhật khi người khác đăng bài (tải lại trang để thấy bài mới).
- Muốn đổi sang project Supabase khác: sửa `url` và `key` trong `config.js` rồi chạy `supabase-schema.sql` bên đó.
