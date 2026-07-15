import test from "node:test";
import assert from "node:assert/strict";
import { incidentStatusBreakdown } from "../../src/incidentUtils.js";

test("phân loại ba trạng thái sự cố và tính phần trăm", () => {
  const result = incidentStatusBreakdown([
    { code: "SC01", status: "✅ Hoàn thành" },
    { code: "SC02", status: "⏳ Đang xử lý" },
    { code: "SC03", status: "Chưa xử lý" },
    { code: "SC04", status: "⛔ Chưa tiếp cận" }
  ]);

  assert.deepEqual(result, {
    total: 4,
    completed: { count: 1, percent: "25%" },
    unprocessed: { count: 2, percent: "50%" },
    unreachable: { count: 1, percent: "25%" }
  });
});

test("hiển thị phần trăm một chữ số thập phân khi không chia hết", () => {
  const result = incidentStatusBreakdown([
    { code: "SC01", status: "Hoàn thành" },
    { code: "SC02", status: "Chưa xử lý" },
    { code: "SC03", status: "Chưa tiếp cận" }
  ]);

  assert.equal(result.completed.percent, "33.3%");
  assert.equal(result.unprocessed.percent, "33.3%");
  assert.equal(result.unreachable.percent, "33.3%");
});

test("không tính bản ghi thiếu mã sự cố hoặc thiếu trạng thái", () => {
  const result = incidentStatusBreakdown([
    { code: "SC01", status: "" },
    { code: "", status: "Chưa tiếp cận" },
    { status: "Hoàn thành" },
    { code: "SC02", status: "Đang xử lý" }
  ]);

  assert.deepEqual(result, {
    total: 1,
    completed: { count: 0, percent: "0%" },
    unprocessed: { count: 1, percent: "100%" },
    unreachable: { count: 0, percent: "0%" }
  });
});
