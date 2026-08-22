import test from "node:test";
import assert from "node:assert/strict";
import {
  isStormHiddenOnDashboard,
  stormDisplayName,
  visibleDashboardStorms
} from "../../src/stormDisplay.js";

test("chỉ ẩn bão Saudel khỏi danh sách hiển thị mà không sửa dữ liệu nguồn", () => {
  const storms = [
    { storm_id: "wp1726", name: "TYPHOON 17W (SAUDEL)" },
    { storm_id: "wp1826", name: "TROPICAL STORM 18W (EIGHTEEN)" }
  ];

  const visible = visibleDashboardStorms(storms);

  assert.equal(isStormHiddenOnDashboard(storms[0]), true);
  assert.deepEqual(visible, [storms[1]]);
  assert.equal(storms.length, 2);
});

test("đổi nhãn hiển thị của bão 18W thành BÃO SỐ 4 (NARRA)", () => {
  assert.equal(
    stormDisplayName({ storm_id: "wp1826", name: "TROPICAL STORM 18W (EIGHTEEN)" }),
    "BÃO SỐ 4 (NARRA)"
  );
  assert.equal(stormDisplayName({ storm_id: "wp1826" }), "BÃO SỐ 4 (NARRA)");
  assert.equal(stormDisplayName({ storm_id: "wp1926", name: "TROPICAL STORM 19W" }), "TROPICAL STORM 19W");
});
