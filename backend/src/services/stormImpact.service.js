import fs from "fs";
import path from "path";
import * as turf from "@turf/turf";
import { supabaseAdmin } from "../config/supabase.js";

export async function recalculateStormImpact() {
  try {
    console.log("[StormImpact] Starting recalculation of cable edge statuses from active JTWC storms...");

    // 1. Fetch active storms from Supabase
    const { data: activeStorms, error: fetchErr } = await supabaseAdmin
      .from('jtwc_storms')
      .select('*')
      .eq('is_active', true);

    if (fetchErr) {
      console.error("[StormImpact] Error fetching active storms from Supabase:", fetchErr);
      throw fetchErr;
    }

    const directPolygons = [];
    const indirectPolygons = [];

    // 2. Extract Polygons from active storm GeoJSONs
    if (Array.isArray(activeStorms)) {
      for (const storm of activeStorms) {
        const geojson = storm.geojson;
        if (!geojson || !Array.isArray(geojson.features)) continue;

        for (const feature of geojson.features) {
          const geomType = feature.geometry?.type;
          if (geomType !== 'Polygon' && geomType !== 'MultiPolygon') continue;

          const propName = String(feature.properties?.name || '').toUpperCase();
          const propDesc = String(feature.properties?.description || '').toUpperCase();
          const combinedText = `${propName} ${propDesc}`;

          // Loại bỏ hoàn toàn hình mờ Danger Swath / Forecast Cone, chỉ lấy các hình quạt bán kính gió thực tế
          const isDangerSwath = combinedText.includes('SWATH') || combinedText.includes('DANGER') || combinedText.includes('CONE') || combinedText.includes('TRACK');
          if (isDangerSwath) continue;

          if (
            combinedText.includes('64 KT') ||
            combinedText.includes('50 KT') ||
            combinedText.includes('64KT') ||
            combinedText.includes('50KT') ||
            combinedText.includes('64 KNOT') ||
            combinedText.includes('50 KNOT')
          ) {
            directPolygons.push(feature);
          } else if (
            combinedText.includes('RADIUS OF 34') ||
            combinedText.includes('34 KT WINDS') ||
            combinedText.includes('34KT WINDS') ||
            combinedText.includes('34 KNOT WINDS')
          ) {
            indirectPolygons.push(feature);
          }
        }
      }
    }

    console.log(`[StormImpact] Found ${directPolygons.length} Direct Risk Polygons (64KT/50KT) and ${indirectPolygons.length} Indirect Risk Polygons (34KT/Cone).`);

    // Helper to combine multiple polygon features into a single collection/feature for booleanIntersects
    function getCombinedGeometry(features) {
      if (!features || features.length === 0) return null;
      if (features.length === 1) return features[0];
      try {
        return turf.combine(turf.featureCollection(features));
      } catch (err) {
        console.warn("[StormImpact] Warning in turf.combine:", err.message);
        return turf.featureCollection(features);
      }
    }

    const directGeo = getCombinedGeometry(directPolygons);
    const indirectGeo = getCombinedGeometry(indirectPolygons);

    // 3. Load Master_Road_Network.geojson
    let geojsonPath = path.resolve(process.cwd(), 'public', 'Master_Road_Network.geojson');
    if (!fs.existsSync(geojsonPath)) {
      geojsonPath = path.resolve(process.cwd(), '..', 'public', 'Master_Road_Network.geojson');
    }

    if (!fs.existsSync(geojsonPath)) {
      console.error("[StormImpact] Master_Road_Network.geojson file not found!");
      return { success: false, message: 'Master_Road_Network.geojson not found' };
    }

    const cableGeoJSON = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));

    // 4. Test spatial intersection for each cable LineString
    const edgeStatusMap = new Map();
    let directCount = 0;
    let indirectCount = 0;
    let normalCount = 0;

    if (Array.isArray(cableGeoJSON.features)) {
      let edgeIndex = 0;
      for (const feature of cableGeoJSON.features) {
        if (feature.geometry?.type !== 'LineString' && feature.geometry?.type !== 'MultiLineString') continue;

        const edgeId = String(feature.properties?.id ?? `edge_${edgeIndex}`);
        edgeIndex++;

        let status = 'normal';

        if (directGeo && turf.booleanIntersects(feature, directGeo)) {
          status = 'unsafe'; // Red - Direct Impact
          directCount++;
        } else if (indirectGeo && turf.booleanIntersects(feature, indirectGeo)) {
          status = 'risky'; // Yellow - Indirect Impact
          indirectCount++;
        } else {
          normalCount++;
        }

        edgeStatusMap.set(edgeId, status);
      }
    }

    // 5. Calculate spatial intersection for Station Node Points
    const { data: dbNodes } = await supabaseAdmin.from('nodes_status').select('id, status');
    const existingNodeStatusMap = new Map((dbNodes || []).map(n => [n.id, n.status]));

    const nodeStatusToUpsert = [];
    let nodeDirectCount = 0;
    let nodeIndirectCount = 0;
    let nodeNormalCount = 0;

    if (Array.isArray(cableGeoJSON.features)) {
      for (const feature of cableGeoJSON.features) {
        if (feature.geometry?.type !== 'Point') continue;

        const nodeName = String(feature.properties?.name || '');
        if (!nodeName) continue;
        const nodeId = `node_${nodeName}`;

        let anhHuong = 'normal';

        if (directGeo && turf.booleanIntersects(feature, directGeo)) {
          anhHuong = 'direct';
          nodeDirectCount++;
        } else if (indirectGeo && turf.booleanIntersects(feature, indirectGeo)) {
          anhHuong = 'indirect';
          nodeIndirectCount++;
        } else {
          nodeNormalCount++;
        }

        nodeStatusToUpsert.push({
          id: nodeId,
          status: existingNodeStatusMap.get(nodeId) || 'active',
          anh_huong: anhHuong
        });
      }
    }

    console.log(`[StormImpact] Station Node breakdown -> Direct: ${nodeDirectCount}, Indirect: ${nodeIndirectCount}, Normal: ${nodeNormalCount}`);

    // 6. Upsert calculated edge statuses into Supabase 'edges_status'
    const edgesToUpsert = Array.from(edgeStatusMap.entries()).map(([id, status]) => ({
      id,
      status
    }));

    if (edgesToUpsert.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from('edges_status')
        .upsert(edgesToUpsert, { onConflict: 'id' });

      if (upsertErr) {
        console.error("[StormImpact] Supabase upsert error for edges_status:", upsertErr);
        throw upsertErr;
      }
    }

    if (nodeStatusToUpsert.length > 0) {
      const { error: nodeErr } = await supabaseAdmin
        .from('nodes_status')
        .upsert(nodeStatusToUpsert, { onConflict: 'id' });

      if (nodeErr) {
        console.warn("[StormImpact] Warning upserting nodes_status:", nodeErr.message);
      }
    }

    console.log("[StormImpact] Successfully updated edges_status & nodes_status in Supabase!");
    return {
      success: true,
      stats: { directCount, indirectCount, normalCount, total: edgesToUpsert.length }
    };

  } catch (error) {
    console.error("[StormImpact] Error in recalculateStormImpact:", error);
    return { success: false, error: error.message };
  }
}
