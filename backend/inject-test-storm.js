import fs from "fs";
import path from "path";
import { supabaseAdmin } from "./src/config/supabase.js";
import { recalculateStormImpact } from "./src/services/stormImpact.service.js";
import { convertStormFansToCircles } from "./src/utils/stormGeometry.js";

const TEST_STORM_ID = "test_yagi";
const TEST_STORM_NAME = "SUPER TYPHOON YAGI (12W) [TEST]";

async function enableTestStorm() {
  console.log(`\n==================================================`);
  console.log(`🌀 BẬT BÃO DIỄN TẬP / TEST: ${TEST_STORM_NAME}`);
  console.log(`==================================================\n`);

  let backupPath = path.resolve(process.cwd(), "backend", "backups", "storm_wp2024.json");
  if (!fs.existsSync(backupPath)) {
    backupPath = path.resolve(process.cwd(), "backups", "storm_wp2024.json");
  }

  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Không tìm thấy file dữ liệu bão tại: ${backupPath}`);
    process.exit(1);
  }

  console.log(`📂 Đang đọc dữ liệu GeoJSON từ: ${backupPath}...`);
  const rawGeojson = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  console.log(`🔄 Đang chuyển đổi bán kính gió thành các hình tròn 360 độ hoàn hảo...`);
  const geojson = convertStormFansToCircles(rawGeojson);

  const stormData = {
    storm_id: TEST_STORM_ID,
    name: TEST_STORM_NAME,
    metadata: {
      name: "SUPER TYPHOON YAGI (12W)",
      maxWind: 130,
      pressure: 915,
      category: "SUPER TYPHOON",
      is_test: true,
      description: "Dữ liệu bão giả lập / diễn tập tác chiến"
    },
    raw_text: "TYPHOON 12W (YAGI) TEST MOCK DATA",
    geojson: geojson,
    is_active: true,
    updated_at: new Date().toISOString()
  };

  console.log(`☁️ Đang tải lên Supabase (bảng jtwc_storms)...`);
  const { error: upsertErr } = await supabaseAdmin
    .from("jtwc_storms")
    .upsert(stormData, { onConflict: "storm_id" });

  if (upsertErr) {
    console.error("❌ Lỗi khi tải lên Supabase:", upsertErr);
    process.exit(1);
  }

  console.log(`✅ Đã nạp bão '${TEST_STORM_ID}' thành công (is_active = true).`);
  console.log(`🔄 Đang tính toán lại vùng ảnh hưởng cho các tuyến cáp và đài trạm...`);

  const impactResult = await recalculateStormImpact();
  if (impactResult.success) {
    console.log(`\n🎉 HOÀN TẤT BẬT BÃO TEST YAGI!`);
    console.log(`👉 Bạn có thể mở Dashboard và tải lại trang để xem bão trên bản đồ.`);
    console.log(`👉 Để tắt bão test, chạy: node backend/inject-test-storm.js off\n`);
  } else {
    console.warn("⚠️ Bão đã được nạp nhưng có cảnh báo khi tính impact:", impactResult.message);
  }
}

async function disableTestStorm() {
  console.log(`\n==================================================`);
  console.log(`🛑 TẮT BÃO DIỄN TẬP / TEST: ${TEST_STORM_NAME}`);
  console.log(`==================================================\n`);

  console.log(`☁️ Đang cập nhật Supabase: đặt is_active = false cho ${TEST_STORM_ID}...`);
  const { error } = await supabaseAdmin
    .from("jtwc_storms")
    .update({ is_active: false })
    .eq("storm_id", TEST_STORM_ID);

  if (error) {
    console.error("❌ Lỗi khi cập nhật Supabase:", error);
    process.exit(1);
  }

  console.log(`✅ Đã tắt bão '${TEST_STORM_ID}' thành công.`);
  console.log(`🔄 Đang cập nhật lại trạng thái tuyến cáp và đài trạm về bình thường...`);

  await recalculateStormImpact();
  console.log(`\n🎉 HOÀN TẤT GỠ BÃO TEST! Tuyến cáp và đài trạm đã trở về trạng thái an toàn.\n`);
}

async function checkStatus() {
  console.log(`\n🔍 Kiểm tra trạng thái bão test trên Supabase...`);
  const { data, error } = await supabaseAdmin
    .from("jtwc_storms")
    .select("storm_id, name, is_active, updated_at")
    .eq("storm_id", TEST_STORM_ID)
    .maybeSingle();

  if (error) {
    console.error("❌ Lỗi truy vấn Supabase:", error);
    return;
  }

  if (!data) {
    console.log(`ℹ️ Bão test '${TEST_STORM_ID}' chưa từng được nạp vào Supabase.`);
  } else {
    console.log(`📌 Mã bão:      ${data.storm_id}`);
    console.log(`📌 Tên hiển thị: ${data.name}`);
    console.log(`📌 Trạng thái:   ${data.is_active ? "🟢 ĐANG HOẠT ĐỘNG (ACTIVE)" : "⚪ ĐÃ TẮT (INACTIVE)"}`);
    console.log(`📌 Cập nhật lúc: ${data.updated_at}\n`);
  }
}

async function main() {
  const arg = (process.argv[2] || "on").trim().toLowerCase();

  if (arg === "off" || arg === "disable" || arg === "stop" || arg === "clean" || arg === "clear") {
    await disableTestStorm();
  } else if (arg === "status" || arg === "check") {
    await checkStatus();
  } else {
    await enableTestStorm();
  }
}

main().catch((err) => {
  console.error("❌ Lỗi không xác định:", err);
  process.exit(1);
});
