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
      ["STT", "Điểm đồn trú", "Đối tác", "Số lượng nhân sự", "", "STT", "Tên nhân sự", "Điện thoại", "E-mail", "Vai trò", "Nơi lưu trú", "Ghi chú", "", "Số đội ứng cứu", "3"],
      ["1", "Hải Phòng", "FFC", "4", "", "1", "Nguyễn Văn A", "0900", "a@example.com", "VHMB", "Hải Phòng", "", "", "Xe bán tải", "1"],
      ["2", "", "FFC", "0", "", "2", "", "", "", "", "", "", "", "Máy đo", "2"],
      ["", "", "", "", "", "3", "", "", "", "", "", "", "", "Máy hàn", "2"]
    ],
    "Thời tiết": [
      ["Di chuyển", "Tình hình thời tiết", "Kinh độ", "Địa phương", "TT", "Vĩ độ", "Hiển thị (dành cho dashboard)"],
      ["Bình thường", "Có mây", "106", "Hải Phòng", "1", "20", "x"],
      ["Bình thường", "Có mây", "105", "Hà Nội", "2", "21", ""]
    ],
    "Công việc": [["", "", ""], ["1", "đo kiểm", "i"]]
  };

  const result = buildDashboardDataFromSheets(sheets);

  assert.equal(result.data.cableIncidents[0].code, "SC01");
  assert.equal(result.data.cableIncidents[0].status, "Đang xử lý");
  assert.equal(result.data.stationIncidents[0].target, "MCI");
  assert.equal(result.data.deployments[0].count, 4);
  assert.equal(result.data.deployments.length, 2);
  assert.equal(result.data.operators[0].name, "Nguyễn Văn A");
  assert.equal(result.data.operators.length, 3);
  assert.deepEqual(result.data.responseResources, { teams: 3, pickupTrucks: 1, measuringDevices: 2, weldingMachines: 2 });
  assert.equal(result.data.weatherRows[0].area, "Hải Phòng");
  assert.equal(result.data.weatherRows.length, 1);
  assert.equal(result.data.tasks[0].name, "đo kiểm");
  assert.match(result.warnings[0], /Công việc/);
});

test("đọc công việc theo ngày, tách từng dòng nội dung và giữ nguyên trạng thái", () => {
  const baseSheets = {
    "SC ngoại vi": [["Ngày", "Mã SC", "Mạch", "Tuyến", "TG phát sinh", "Khu vực", "Nguyên nhân", "Tình trạng"]],
    "SC đài trạm": [["Ngày", "Mã SC", "Mạch", "Trạm", "TG phát sinh", "Chi nhánh", "Nguyên nhân", "Tình trạng"]],
    "DS tuyến, trạm ảnh hưởng": [["TT", "Trạm", "Tọa độ", "Khoảng cách", "Vùng ảnh hưởng", "Kế hoạch nhân sự", "Nhân sự chi nhánh", "Điện thoại", "Ghi chú", "", "TT", "Mạch", "Tuyến", "Chiều dài tuyến", "Ảnh hưởng tuyến cáp"]],
    "Nhân sự": [["STT", "Đồn trú", "Đối tác", "SL nhân sự tại đồn trú", "", "STT", "Họ và tên", "Số điện thoại", "Email", "Chức vụ", "Vị trí lưu trú"]],
    "Thời tiết": [["STT", "Khu vực", "Lat", "Long", "Thời tiết", "Khả năng di chuyển", "Hiển thị (dành cho dashboard)"]],
    "Công việc": [
      ["Ngày", "Nội dung công việc", "Trạng thái"],
      ["15/07/2026", "1. Đo kiểm tuyến\n2. Tuần tra tuyến", "Hoàn thành"],
      ["15/07/2026", "3. Khắc phục sự cố", "Đang thực hiện"],
      ["15/07/2026", "", "Chưa thực hiện"]
    ]
  };

  const result = buildDashboardDataFromSheets(baseSheets);

  assert.equal(result.data.tasks.length, 3);
  assert.deepEqual(
    result.data.tasks.map(({ date, name, status }) => ({ date, name, status })),
    [
      { date: "15/07/2026", name: "1. Đo kiểm tuyến", status: "Hoàn thành" },
      { date: "15/07/2026", name: "2. Tuần tra tuyến", status: "Hoàn thành" },
      { date: "15/07/2026", name: "3. Khắc phục sự cố", status: "Đang thực hiện" }
    ]
  );
});
