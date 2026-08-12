import fs from "fs";
import path from "path";
import { supabaseAdmin } from "./src/config/supabase.js";
import { recalculateStormImpact } from "./src/services/stormImpact.service.js";

function shiftCoordinates(coords, deltaLng, deltaLat) {
  if (!Array.isArray(coords) || coords.length === 0) return coords;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return [coords[0] + deltaLng, coords[1] + deltaLat];
  }
  return coords.map((c) => shiftCoordinates(c, deltaLng, deltaLat));
}

async function main() {
  const stormId = (process.argv[2] || "").trim().toLowerCase();
  const targetLat = Number(process.argv[3]);
  const targetLng = Number(process.argv[4]);

  if (!stormId || isNaN(targetLat) || isNaN(targetLng)) {
    console.log("\n❌ Cú pháp không hợp lệ!");
    console.log("👉 Sử dụng: node backend/shift-storm.js <stormId> <vĩ_độ_lat> <kinh_độ_lng>");
    console.log("👉 Ví dụ:    node backend/shift-storm.js wp1426 20.658755 107.589392\n");
    process.exit(1);
  }

  console.log(`\n🌀 Đang xử lý dịch chuyển cơn bão ${stormId.toUpperCase()} đến [Lat: ${targetLat}, Lng: ${targetLng}]...`);

  // 1. Lấy dữ liệu bão từ Supabase
  const { data: storm, error: fetchErr } = await supabaseAdmin
    .from('jtwc_storms')
    .select('*')
    .eq('storm_id', stormId)
    .single();

  if (fetchErr || !storm || !storm.geojson) {
    console.error(`❌ Không tìm thấy dữ liệu bão mã '${stormId}' trong Supabase!`);
    process.exit(1);
  }

  // 2. Tạo thư mục lưu backup nếu chưa có
  const backupDir = path.resolve(process.cwd(), 'backend', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupPath = path.join(backupDir, `storm_${stormId}.json`);
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, JSON.stringify(storm.geojson, null, 2), 'utf8');
    console.log(`💾 Đã tạo file sao lưu vị trí gốc tại: backend/backups/storm_${stormId}.json`);
  } else {
    console.log(`ℹ️ Đã có file sao lưu vị trí gốc tại: backend/backups/storm_${stormId}.json`);
  }

  // Luôn lấy GeoJSON gốc từ backup để tính khoảng dịch chuyển chính xác
  const originalGeoJSON = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const geojson = JSON.parse(JSON.stringify(originalGeoJSON));

  // 3. Tìm tâm bão hiện tại (Feature Point đầu tiên)
  let currentCenter = null;
  for (const f of geojson.features) {
    if (f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates)) {
      currentCenter = f.geometry.coordinates;
      break;
    }
  }

  if (!currentCenter) {
    console.error("❌ Không tìm thấy tọa độ tâm bão trong GeoJSON!");
    process.exit(1);
  }

  const deltaLng = targetLng - currentCenter[0];
  const deltaLat = targetLat - currentCenter[1];

  console.log(`📍 Tâm bão hiện tại: [Lng: ${currentCenter[0]}, Lat: ${currentCenter[1]}]`);
  console.log(`🚀 Khoảng dịch chuyển: ΔLng = ${deltaLng.toFixed(6)}, ΔLat = ${deltaLat.toFixed(6)}`);

  // 4. Dịch chuyển toàn bộ tọa độ trong GeoJSON
  geojson.features = geojson.features.map((f) => {
    if (f.geometry && f.geometry.coordinates) {
      f.geometry.coordinates = shiftCoordinates(f.geometry.coordinates, deltaLng, deltaLat);
    }
    return f;
  });

  // 5. Cập nhật lại bão trên Supabase
  const { error: updateErr } = await supabaseAdmin
    .from('jtwc_storms')
    .update({
      geojson: geojson,
      is_active: true,
      updated_at: new Date().toISOString()
    })
    .eq('storm_id', stormId);

  if (updateErr) {
    console.error("❌ Lỗi khi cập nhật GeoJSON bão trên Supabase:", updateErr);
    process.exit(1);
  }

  console.log(`✅ Đã cập nhật tọa độ bão ${stormId.toUpperCase()} lên Supabase thành công!`);

  // 6. Tính toán lại va cắt cáp tự động
  console.log("⚡ Đang quét lại va cắt 74 tuyến cáp theo vị trí bão mới...");
  const impactResult = await recalculateStormImpact();

  if (impactResult.success) {
    const s = impactResult.stats;
    console.log(`\n🎉 HOÀN TẤT DỊCH CHUYỂN BÃO & TÍNH TOÁN CÁP!`);
    console.log(`📊 Kết quả màu sắc 74 tuyến cáp:`);
    console.log(`   🔴 Ảnh hưởng trực tiếp (unsafe): ${s.directCount} tuyến`);
    console.log(`   🟡 Ảnh hưởng gián tiếp (risky):   ${s.indirectCount} tuyến`);
    console.log(`   🔵 Tuyến bình thường (normal):   ${s.normalCount} tuyến\n`);
  } else {
    console.error("⚠️ Lỗi khi quét lại va cắt cáp:", impactResult.error);
  }

  process.exit(0);
}

main();
