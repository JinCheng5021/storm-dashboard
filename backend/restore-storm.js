import fs from "fs";
import path from "path";
import { supabaseAdmin } from "./src/config/supabase.js";
import { recalculateStormImpact } from "./src/services/stormImpact.service.js";

async function main() {
  const stormId = (process.argv[2] || "").trim().toLowerCase();

  if (!stormId) {
    console.log("\n❌ Cú pháp không hợp lệ!");
    console.log("👉 Sử dụng: node backend/restore-storm.js <stormId>");
    console.log("👉 Ví dụ:    node backend/restore-storm.js wp1426\n");
    process.exit(1);
  }

  const backupPath = path.resolve(process.cwd(), 'backend', 'backups', `storm_${stormId}.json`);

  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Không tìm thấy file sao lưu vị trí gốc tại: backend/backups/storm_${stormId}.json!`);
    process.exit(1);
  }

  console.log(`\n🔄 Đang khôi phục bão ${stormId.toUpperCase()} về vị trí thực tế ban đầu từ file sao lưu...`);

  const originalGeoJSON = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

  // 1. Cập nhật lại bão gốc lên Supabase
  const { error: updateErr } = await supabaseAdmin
    .from('jtwc_storms')
    .update({
      geojson: originalGeoJSON,
      updated_at: new Date().toISOString()
    })
    .eq('storm_id', stormId);

  if (updateErr) {
    console.error("❌ Lỗi khi khôi phục dữ liệu bão lên Supabase:", updateErr);
    process.exit(1);
  }

  console.log(`✅ Đã khôi phục dữ liệu GeoJSON gốc của bão ${stormId.toUpperCase()} lên Supabase!`);

  // 2. Tính toán lại va cắt cáp
  console.log("⚡ Đang quét lại va cắt cáp theo vị trí bão thực tế...");
  const impactResult = await recalculateStormImpact();

  if (impactResult.success) {
    const s = impactResult.stats;
    console.log(`\n🎉 KHÔI PHỤC BÃO THÀNH CÔNG!`);
    console.log(`📊 Trạng thái 74 tuyến cáp hiện tại:`);
    console.log(`   🔴 Ảnh hưởng trực tiếp (unsafe): ${s.directCount} tuyến`);
    console.log(`   🟡 Ảnh hưởng gián tiếp (risky):   ${s.indirectCount} tuyến`);
    console.log(`   🔵 Tuyến bình thường (normal):   ${s.normalCount} tuyến\n`);
  }

  process.exit(0);
}

main();
