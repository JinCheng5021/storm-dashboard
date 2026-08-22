import test from "node:test";
import assert from "node:assert/strict";
import { formatPmbEquipmentSummary } from "../../src/resourceSummary.js";

const baseResources = {
  pickupTrucks: 1,
  measuringDevices: 2,
  weldingMachines: 2
};

test("hiển thị xe công ty khi số lượng lớn hơn 0", () => {
  assert.equal(
    formatPmbEquipmentSummary({ ...baseResources, companyVehicles: 2 }),
    "1 xe bán tải + 2 xe công ty + 2 máy đo + 2 máy hàn"
  );
});

test("ẩn xe công ty khi bằng 0 hoặc để trống", () => {
  const expected = "1 xe bán tải + 2 máy đo + 2 máy hàn";
  assert.equal(formatPmbEquipmentSummary({ ...baseResources, companyVehicles: 0 }), expected);
  assert.equal(formatPmbEquipmentSummary({ ...baseResources, companyVehicles: "" }), expected);
  assert.equal(formatPmbEquipmentSummary(baseResources), expected);
});
