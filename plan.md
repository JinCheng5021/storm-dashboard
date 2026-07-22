# Kế hoạch Thay đổi Nguồn Dữ liệu Bão (GDACS -> JTWC)

## 1. Hiện trạng Hệ thống
- **Nguồn dữ liệu:** Đang sử dụng RSS từ GDACS (`https://www.gdacs.org/xml/rss.xml`).
- **Giao diện:** Hiển thị thông tin cơ bản của bão kèm một ảnh tĩnh (Map Image) tải từ GDACS.
- **Các file liên quan đang đảm nhiệm:**
  - `backend/src/services/gdacs.service.js`: Phân tích XML từ GDACS.
  - `backend/src/controllers/gdacs.controller.js` & `proxy.controller.js`: Cung cấp API `/api/storms` và `/api/proxy-image`.
  - `src/App.tsx`: Hiển thị danh sách bão (Panel Thông tin bão) và xử lý lỗi ảnh.

## 2. Mục tiêu Thay đổi (Requirements)
- **Nguồn mới:** Chuyển sang sử dụng **JTWC** (Joint Typhoon Warning Center - `https://www.metoc.navy.mil/jtwc/jtwc.html`).
- **Dữ liệu cần lấy:**
  - `TC Warning Text`: Đoạn text thuần (TXT) chứa chi tiết thông số cơn bão.
  - `Google Earth Overlay (KMZ)`: File hình học của cơn bão.
- **Giao diện mới:**
  - Panel "Thông tin bão" bên phải chỉ hiển thị Metadata (chữ) chi tiết của bão (không dùng ảnh tĩnh nữa).
  - Có một **Icon con mắt (👁️)** bên cạnh mỗi cơn bão. Khi bấm vào sẽ Bật/Tắt lớp đồ họa GeoJSON (đường đi, bán kính gió) của cơn bão đó chèn trực tiếp lên bản đồ (Map Canvas).

## 3. Thiết kế Kỹ thuật (Technical Implementation)

### 3.1. Cơ sở dữ liệu (Supabase)
- Cần viết câu lệnh SQL (Migration) tạo một bảng mới (ví dụ: `jtwc_storms`).
- **Cấu trúc bảng (Dự kiến):**
  - `id` (UUID / Primary Key)
  - `storm_id` (String - VD: wp0626)
  - `name` (String - VD: FAUSTO)
  - `metadata` (JSONB) - Lưu trữ các thông số bão.
  - `geojson` (JSONB) - Lưu dữ liệu hình học sau khi convert từ KMZ.
  - `last_updated` (Timestamp - UTC)

### 3.2. Crawl Data & Cron Job
- **Kiến trúc Cron Job: Vercel hoàn toàn có hỗ trợ Cron Jobs** thông qua việc cấu hình file `vercel.json` (định nghĩa lịch trình) để Vercel tự động gọi vào một API Endpoint của chúng ta (Serverless Function).
- **Tần suất:** Gọi tự động **2 tiếng / lần**.
- **Crawl thủ công:** Bổ sung một API trigger crawl thủ công và tạo nút "Cập nhật" trên UI (dành riêng cho quyền Admin). Toàn bộ logic giải quyết bất đồng bộ, cào web, convert file sẽ nằm trong API Backend này.

### 3.3. Xử lý "TC Warning Text" (Bóc tách Metadata)
Dữ liệu trả về là file Text thô có cấu trúc nghiệp vụ. Backend cần dùng Regex hoặc String Parser để lấy ra 6 thông số:
1. **Tên bão & Số hiệu:** VD: HURRICANE 06E (FAUSTO) - Bản tin #012.
2. **Vị trí hiện tại:** Lấy toạ độ (VD: 16.5°N - 119.5°W) và khoảng cách vị trí tương quan nếu có.
3. **Sức gió & Gió giật:** Tách số Knot và Convert sang km/h.
   - Sức gió mạnh nhất (Max Sustained Winds).
   - Gió giật (Gusts).
4. **Hướng & Tốc độ di chuyển:** Lấy góc độ (Ví dụ: 295° Tây Tây Bắc) và Convert tốc độ từ Knot sang km/h.
5. **Áp suất tâm bão:** Tính bằng hPa / MB.
6. **Thời gian phát hành:** Chuyển đổi từ định dạng Z (Zulu/UTC) sang giờ Việt Nam (UTC+7).

### 3.4. Xử lý đồ họa KMZ -> GeoJSON & MapCanvas
- Backend sẽ tải file `KMZ`. Dùng `adm-zip` giải nén lấy nội dung `KML`.
- Sử dụng `@tmcw/togeojson` để convert KML thành GeoJSON.
- Lưu trữ cục GeoJSON này vào Database.
- Trên giao diện Frontend, khi user click "Con mắt":
  - Nếu Bật: MapLibre sẽ gọi `addSource` (đưa GeoJSON vào) và `addLayer` (để vẽ). Màu sắc sẽ được định nghĩa chủ động trên code Frontend dựa trên properties của GeoJSON (không phụ thuộc vào màu cứng của KML).
  - Nếu Tắt: MapLibre gọi `removeLayer` / `removeSource` hoặc set `visibility: none`.
  - Hỗ trợ bật/tắt độc lập cho nhiều cơn bão cùng lúc.

## 4. Các hạng mục Khám phá thêm (Exploration & Next Steps)
Trước khi bắt tay vào code, chúng ta cần:
1. **Khám phá thêm cấu trúc thẻ HTML của JTWC:** Xác minh lại cấu trúc thẻ (`<ul>`, `<li>`, `<b>`) đối với các cảnh báo thực tế để đảm bảo scrapper bằng `cheerio` không bị trượt mục tiêu.
2. **Khám phá cấu trúc file "TC Warning Text":** Tải thử 1-2 file cảnh báo dạng Text `.txt` thực tế của JTWC để nghiên cứu bố cục dòng, từ khóa (keywords) dùng làm mỏ neo (anchor) viết Regex chuẩn xác cho việc trích xuất Metadata.
3. **Kiểm tra File KMZ:** Phân tích nội dung GeoJSON tạo ra từ KMZ để chuẩn bị bộ màu MapLibre phù hợp trên Frontend.
