import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboardDataFromSheets } from "../src/services/dashboard.service.js";

test("giữ nguyên cấu trúc dữ liệu dashboard khi các cột được sắp xếp lại", () => {
  const sheets = {
    "SC ngoại vi": [
      ["Tình trạng", "Mã SC", "Khu vực", "Tuyến", "Mạch", "TG phát sinh", "Ngày", "Nguyên nhân"],
      ["Đang xử lý", "SC01", "HPG", "HPG - TNN", "DBB", "13/07/2026 09:00", "13/07/2026", "Mưa bão"]
    ],
    "SC đài trạm": [
      ["Trạng thái", "Mã sự cố", "Chi nhánh", "Tên trạm", "Trục", "Thời gian phát sinh", "Ngày", "Nguyên nhân"],
      ["Hoàn thành", "SC02", "QNH", "MCI", "DBB", "13/07/2026 10:00", "13/07/2026", "Mất điện"]
    ],
    "DS tuyến, trạm ảnh hưởng": [["TT", "Trạm", "Tọa độ", "Khoảng cách", "Vùng ảnh hưởng", "Kế hoạch nhân sự", "Nhân sự chi nhánh", "Điện thoại", "Ghi chú", "", "TT", "Mạch", "Tuyến", "Chiều dài tuyến", "Ảnh hưởng tuyến cáp"]],
    "Nhân sự": [
      ["STT", "Điểm đồn trú", "Đối tác", "Số lượng nhân sự", "", "STT", "Tên nhân sự", "Điện thoại", "E-mail", "Vai trò", "Nơi lưu trú", "Ghi chú"],
      ["1", "Hải Phòng", "FFC", "4", "", "1", "Nguyễn Văn A", "0900", "a@example.com", "VHMB", "Hải Phòng", ""]
    ],
    "Thời tiết": [
      ["Di chuyển", "Tình hình thời tiết", "Kinh độ", "Địa phương", "TT", "Vĩ độ"],
      ["Bình thường", "Có mây", "106", "Hải Phòng", "1", "20"]
    ],
    "Công việc": [["", "", ""], ["1", "đo kiểm", "i"]]
  };

  const result = buildDashboardDataFromSheets(sheets);

  assert.equal(result.data.cableIncidents[0].code, "SC01");
  assert.equal(result.data.cableIncidents[0].status, "Đang xử lý");
  assert.equal(result.data.stationIncidents[0].target, "MCI");
  assert.equal(result.data.deployments[0].count, 4);
  assert.equal(result.data.operators[0].name, "Nguyễn Văn A");
  assert.equal(result.data.weatherRows[0].area, "Hải Phòng");
  assert.equal(result.data.tasks[0].name, "đo kiểm");
  assert.match(result.warnings[0], /Công việc/);
});
