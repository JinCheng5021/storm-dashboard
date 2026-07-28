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
    "DS tuyến, trạm ảnh hưởng": [["TT", "Trạm", "Tọa độ", "Khoảng cách", "Vùng ảnh hưởng", "Kế hoạch nhân sự", "Nhân sự chi nhánh", "Điện thoại", "Ghi chú", "", "TT", "Mạch", "Tuyến", "Chiều dài tuyến", "Ảnh hưởng tuyến cáp", "SL KHG FTI", "Mức độ"]],
    "Nhân sự": [
      ["STT", "Điểm đồn trú", "Đối tác", "Số lượng nhân sự", "Hiển thị dashboard", "", "STT", "Tên nhân sự", "Điện thoại", "E-mail", "Vai trò", "Nơi lưu trú", "Ghi chú", "", "Số đội ứng cứu", "3"],
      ["1", "Hải Phòng", "FFC", "4", "x", "", "1", "Nguyễn Văn A", "0900", "a@example.com", "VHMB", "Hải Phòng", "", "", "Xe bán tải", "1"],
      ["2", "Hà Nội", "FFC", "6", "", "", "2", "", "", "", "", "", "", "", "Máy đo", "2"],
      ["", "", "", "", "", "", "3", "", "", "", "", "", "", "", "Máy hàn", "2"]
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
  assert.equal(result.data.deployments.length, 1);
  assert.equal(result.data.operators[0].name, "Nguyễn Văn A");
  assert.equal(result.data.operators.length, 3);
  assert.deepEqual(result.data.responseResources, { teams: 3, pickupTrucks: 1, measuringDevices: 2, weldingMachines: 2 });
  assert.equal(result.data.weatherRows[0].area, "Hải Phòng");
  assert.equal(result.data.weatherRows.length, 1);
  assert.equal(result.data.preStormTasks[0].name, "đo kiểm");
  assert.equal(result.data.inStormTasks.length, 0);
  assert.match(result.warnings[0], /Công việc/);
});

test("tách độc lập bảng công việc Trước bão và Trong bão, không trộn dữ liệu cùng hàng", () => {
  const baseSheets = {
    "SC ngoại vi": [["Ngày", "Mã SC", "Mạch", "Tuyến", "TG phát sinh", "Khu vực", "Nguyên nhân", "Tình trạng"]],
    "SC đài trạm": [["Ngày", "Mã SC", "Mạch", "Trạm", "TG phát sinh", "Chi nhánh", "Nguyên nhân", "Tình trạng"]],
    "DS tuyến, trạm ảnh hưởng": [["TT", "Trạm", "Tọa độ", "Khoảng cách", "Vùng ảnh hưởng", "Kế hoạch nhân sự", "Nhân sự chi nhánh", "Điện thoại", "Ghi chú", "", "TT", "Mạch", "Tuyến", "Chiều dài tuyến", "Ảnh hưởng tuyến cáp", "SL KHG FTI", "Mức độ"]],
    "Nhân sự": [["STT", "Đồn trú", "Đối tác", "SL nhân sự tại đồn trú", "Hiển thị", "", "STT", "Họ và tên", "Số điện thoại", "Email", "Chức vụ", "Vị trí lưu trú"]],
    "Thời tiết": [["STT", "Khu vực", "Lat", "Long", "Thời tiết", "Khả năng di chuyển", "Hiển thị (dành cho dashboard)"]],
    "Công việc": [
      ["TRƯỚC BÃO", "", "", "", "", "TRONG BÃO", "", ""],
      ["STT", "Nội dung công việc", "Trạng thái", "", "", "Ngày", "Nội dung công việc", "Trạng thái"],
      ["1", "Chuẩn bị vật tư", "Chưa thực hiện", "", "", "15/07/2026", "1. Đo kiểm tuyến\n2. Tuần tra tuyến", "Hoàn thành"],
      ["2", "Kiểm tra nguồn điện", "Hoàn thành", "", "", "15/07/2026", "3. Khắc phục sự cố", "Đang thực hiện"]
    ]
  };

  const result = buildDashboardDataFromSheets(baseSheets);

  assert.deepEqual(
    result.data.preStormTasks.map(({ name, status, mode }) => ({ name, status, mode })),
    [
      { name: "Chuẩn bị vật tư", status: "Chưa thực hiện", mode: "truoc_bao" },
      { name: "Kiểm tra nguồn điện", status: "Hoàn thành", mode: "truoc_bao" }
    ]
  );
  assert.equal(result.data.inStormTasks.length, 3);
  assert.deepEqual(
    result.data.inStormTasks.map(({ date, name, status, mode }) => ({ date, name, status, mode })),
    [
      { date: "15/07/2026", name: "1. Đo kiểm tuyến", status: "Hoàn thành", mode: "trong_bao" },
      { date: "15/07/2026", name: "2. Tuần tra tuyến", status: "Hoàn thành", mode: "trong_bao" },
      { date: "15/07/2026", name: "3. Khắc phục sự cố", status: "Đang thực hiện", mode: "trong_bao" }
    ]
  );
  assert.deepEqual(result.data.tasks, result.data.inStormTasks);
});

test("lấy toàn bộ thông tin tuyến từ tab DS tuyến, trạm ảnh hưởng khi không còn tab Thông tin tuyến", () => {
  const sheets = {
    "SC ngoại vi": [["Ngày", "Mã SC", "Mạch", "Tuyến", "TG phát sinh", "Khu vực", "Nguyên nhân", "Tình trạng"]],
    "SC đài trạm": [["Ngày", "Mã SC", "Mạch", "Trạm", "TG phát sinh", "Chi nhánh", "Nguyên nhân", "Tình trạng"]],
    "DS tuyến, trạm ảnh hưởng": [
      ["TT", "Trạm", "Tọa độ", "Khoảng cách", "Vùng ảnh hưởng", "Kế hoạch nhân sự", "Nhân sự chi nhánh", "Điện thoại", "Ghi chú", "", "TT", "Mạch", "Tuyến", "Chiều dài", "Ảnh hưởng tuyến cáp", "SL POP ảnh hưởng", "SL KHG FTI", "Độ khả dụng", "Tần suất SC/100km", "Mức độ"],
      ["", "", "", "", "", "", "", "", "", "", "1", "DBB", "THA - CGT 48FO", "93.2", "Trực tiếp", "3", "2", "56%", "2.15", "Có nguy cơ"]
    ],
    "Nhân sự": [["STT", "Đồn trú", "Đối tác", "SL nhân sự tại đồn trú", "Hiển thị", "", "STT", "Họ và tên", "Số điện thoại", "Email", "Chức vụ", "Vị trí lưu trú"]],
    "Thời tiết": [["STT", "Khu vực", "Lat", "Long", "Thời tiết", "Khả năng di chuyển", "Hiển thị (dành cho dashboard)"]],
    "Công việc": [
      ["TRƯỚC BÃO", "", "", "", "", "TRONG BÃO", "", ""],
      ["STT", "Nội dung công việc", "Trạng thái", "", "", "Ngày", "Nội dung công việc", "Trạng thái"]
    ]
  };

  const result = buildDashboardDataFromSheets(sheets);

  assert.deepEqual(result.data.routeInformation, [{
    route: "THA - CGT 48FO",
    length: "93.2",
    pops: "3",
    availability: "56%",
    incidentFrequency: "2.15"
  }]);
  assert.deepEqual(result.data.stormImpactSummary, {
    popCount: 3,
    ftiCustomerCount: 2
  });
  assert.equal(result.data.affectedRoutes[0].riskLevel, "Có nguy cơ");
});
