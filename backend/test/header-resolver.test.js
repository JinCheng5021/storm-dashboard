import test from "node:test";
import assert from "node:assert/strict";
import { createHeaderResolver } from "../src/lib/header-resolver.js";
import { SheetSchemaError } from "../src/errors/sheet-schema.error.js";
import { SHEET_SCHEMAS } from "../src/config/sheets.config.js";

test("đọc đúng dữ liệu khi thứ tự cột thời tiết thay đổi", () => {
  const rows = [
    ["Khả năng di chuyển", "Thời tiết", "Long", "Khu vực", "STT", "Lat"],
    ["Bình thường", "Mưa nhỏ", "106.6", "Hải Phòng", "1", "20.8"]
  ];
  const resolver = createHeaderResolver("Thời tiết", rows, SHEET_SCHEMAS["Thời tiết"]);
  const dataRow = rows[resolver.dataStartIndex];

  assert.equal(resolver.get(dataRow, "area"), "Hải Phòng");
  assert.equal(resolver.get(dataRow, "weather"), "Mưa nhỏ");
  assert.equal(resolver.get(dataRow, "mobility"), "Bình thường");
});

test("chấp nhận alias tiêu đề đã cấu hình", () => {
  const rows = [
    ["TT", "Địa phương", "Vĩ độ", "Kinh độ", "Tình hình thời tiết", "Di chuyển"],
    ["1", "Hà Nội", "21", "105", "Có mây", "Bình thường"]
  ];
  const resolver = createHeaderResolver("Thời tiết", rows, SHEET_SCHEMAS["Thời tiết"]);
  assert.equal(resolver.get(rows[1], "area"), "Hà Nội");
  assert.equal(resolver.get(rows[1], "weather"), "Có mây");
});

test("phân biệt hai cột STT trùng nhau theo lần xuất hiện", () => {
  const headers = ["STT", "Đồn trú", "Đối tác", "SL nhân sự tại đồn trú", "", "STT", "Họ và tên", "Số điện thoại", "Email", "Chức vụ", "Vị trí lưu trú", "Ghi chú"];
  const row = ["7", "Hải Phòng", "FFC", "3", "", "2", "Nguyễn Văn A", "0900", "a@example.com", "VHMB", "Hà Nội", ""];
  const resolver = createHeaderResolver("Nhân sự", [headers, row], SHEET_SCHEMAS["Nhân sự"]);

  assert.equal(resolver.get(row, "deploymentStt"), "7");
  assert.equal(resolver.get(row, "operatorStt"), "2");
});

test("báo lỗi rõ ràng khi tên cột bắt buộc bị gõ sai", () => {
  const rows = [["STT", "Khu vực", "Lat", "Long", "Thời tiế", "Khả năng di chuyển"]];

  assert.throws(
    () => createHeaderResolver("Thời tiết", rows, SHEET_SCHEMAS["Thời tiết"]),
    (error) => {
      assert.ok(error instanceof SheetSchemaError);
      assert.deepEqual(error.missingColumns, ["Thời tiết"]);
      assert.match(error.suggestions[0], /Thời tiế/);
      return true;
    }
  );
});

test("tab Công việc chưa có tiêu đề vẫn chạy bằng fallback có cảnh báo", () => {
  const rows = [["", "", ""], ["1", "đo kiểm", "i"]];
  const resolver = createHeaderResolver("Công việc", rows, SHEET_SCHEMAS["Công việc"]);

  assert.equal(resolver.headerRowIndex, -1);
  assert.equal(resolver.get(rows[1], "name"), "đo kiểm");
  assert.equal(resolver.warnings.length, 1);
});
