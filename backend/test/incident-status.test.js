import test from "node:test";
import assert from "node:assert/strict";
import { incidentStatusBreakdown, summarizeRouteIncidents } from "../../src/incidentUtils.js";

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

test("tính và tổng hợp đầy đủ nhiều mã sự cố trên cùng một tuyến", () => {
  const incidents = [
    {
      code: "SC05072601096",
      target: "BKE - GPU",
      status: "Hoàn thành",
      incidentCount: "2",
      location: "Cách GPU 20km\nCách GPU 13km",
      processingTime: "1:06:00"
    },
    {
      code: "SC05072601099",
      target: "BKE - GPU",
      status: "Hoàn thành",
      incidentCount: "1",
      location: "cách GPU 33km",
      processingTime: "2:02:00"
    }
  ];

  assert.equal(incidentStatusBreakdown(incidents).total, 2);
  assert.deepEqual(summarizeRouteIncidents(incidents), {
    recordCount: 2,
    incidentCount: 3,
    location: "Cách GPU 20km\nCách GPU 13km\ncách GPU 33km",
    processingTime: "03:08:00"
  });
});
