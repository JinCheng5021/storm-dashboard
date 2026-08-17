import fs from "fs";
import path from "path";
import { supabaseAdmin } from "./src/config/supabase.js";
import { recalculateStormImpact } from "./src/services/stormImpact.service.js";

async function main() {
  console.log("\n🧹 ĐANG TIẾN HÀNH CHUẨN HÓA DỮ LIỆU CÁP & LÀM SẠCH SUPABASE...\n");

  // 1. Đọc tệp Master_Road_Network.geojson
  const geojsonPath = path.resolve(process.cwd(), 'public', 'Master_Road_Network.geojson');
  if (!fs.existsSync(geojsonPath)) {
    console.error("❌ Không tìm thấy file public/Master_Road_Network.geojson!");
    process.exit(1);
  }

  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  let updatedCount = 0;
  let nextRouteId = 80;

  if (Array.isArray(geojson.features)) {
    geojson.features.forEach((feature) => {
      if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') {
        if (!feature.properties) feature.properties = {};
        if (!feature.properties.id) {
          const newId = `route_${nextRouteId++}`;
          feature.properties.id = newId;
          updatedCount++;
          console.log(`  ➕ Gán ID chuẩn: [${newId}] cho tuyến '${feature.properties.name}'`);
        }
      }
    });
  }

  // Lưu lại GeoJSON đã được gán ID chuẩn
  fs.writeFileSync(geojsonPath, JSON.stringify(geojson, null, 2), 'utf8');
  console.log(`\n✅ Đã cập nhật gán ${updatedCount} ID chuẩn (route_80 -> route_${nextRouteId - 1}) vào public/Master_Road_Network.geojson!`);

  // 2. Xóa các bản ghi rác 'edge_74' -> 'edge_85' trên Supabase
  const garbageIds = Array.from({ length: 12 }, (_, i) => `edge_${74 + i}`);
  console.log(`\n🗑️ Đang xóa ${garbageIds.length} bản ghi rác (${garbageIds[0]}..${garbageIds[garbageIds.length - 1]}) trên bảng edges_status trong Supabase...`);

  const { error: deleteErr } = await supabaseAdmin
    .from('edges_status')
    .delete()
    .in('id', garbageIds);

  if (deleteErr) {
    console.warn("⚠️ Cảnh báo khi xóa bản ghi rác:", deleteErr.message);
  } else {
    console.log("✅ Đã xóa thành công các bản ghi rác trên Supabase!");
  }

  // 3. Chạy lại quét va cắt bão để cập nhật 86 tuyến với ID chuẩn
  console.log("\n⚡ Đang quét lại va cắt bão cho 86 tuyến cáp mới được chuẩn hóa...");
  const result = await recalculateStormImpact();

  if (result.success) {
    const s = result.stats;
    console.log(`\n🎉 HOÀN TẤT CHUẨN HÓA VÀ ĐỒNG BỘ DỮ LIỆU!`);
    console.log(`📊 Kết quả 86 tuyến cáp chuẩn (route_0 -> route_91):`);
    console.log(`   🔴 Ảnh hưởng trực tiếp (unsafe): ${s.directCount} tuyến`);
    console.log(`   🟡 Ảnh hưởng gián tiếp (risky):   ${s.indirectCount} tuyến`);
    console.log(`   🔵 Tuyến bình thường (normal):   ${s.normalCount} tuyến\n`);
  } else {
    console.error("❌ Lỗi khi quét lại va cắt bão:", result.error);
  }

  process.exit(0);
}

main();
