import { XMLParser } from "fast-xml-parser";
import AdmZip from "adm-zip";
import { DOMParser } from "@xmldom/xmldom";
import * as toGeoJSON from "@tmcw/togeojson";
import { parseJtwcText } from "../utils/jtwcParser.js";
import { convertStormFansToCircles } from "../utils/stormGeometry.js";
import { supabaseAdmin } from "../config/supabase.js";
import { recalculateStormImpact } from "./stormImpact.service.js";

const RSS_URL = "https://www.metoc.navy.mil/jtwc/rss/jtwc.rss";

// Helper function to prevent GeoJSON from wrapping across the antimeridian
function unwrapGeoJSON(geojson) {
  if (!geojson) return geojson;

  function unwrapCoordinates(coords) {
    if (!Array.isArray(coords) || coords.length === 0) return coords;
    
    if (typeof coords[0] === 'number') return coords;
    
    if (typeof coords[0][0] === 'number') {
      let prevLng = coords[0][0];
      return coords.map((pt, i) => {
        if (i === 0) return pt;
        let lng = pt[0];
        const lat = pt[1];
        while (lng - prevLng > 180) lng -= 360;
        while (prevLng - lng > 180) lng += 360;
        prevLng = lng;
        return [lng, lat];
      });
    }
    
    return coords.map(c => unwrapCoordinates(c));
  }

  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    geojson.features = geojson.features.map(f => {
      if (f.geometry && f.geometry.coordinates) {
        f.geometry.coordinates = unwrapCoordinates(f.geometry.coordinates);
      }
      return f;
    });
  }
  return geojson;
}

export async function syncJtwcStorms() {
  try {
    console.log("Fetching JTWC RSS feed...");
    const res = await fetch(RSS_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const xml = await res.text();
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
    const parsed = parser.parse(xml);
    
    let items = parsed?.rss?.channel?.item;
    if (!items) return [];
    if (!Array.isArray(items)) items = [items];
    
    const activeStormIds = [];
    let syncedCount = 0;

    // --- CẤU HÌNH LỌC KHU VỰC BÃO ---
    // Đổi biến này thành `true` nếu bạn CHỈ muốn theo dõi bão ở khu vực Biển Đông / Tây Bắc Thái Bình Dương (Việt Nam).
    // Đổi thành `false` nếu bạn muốn hiển thị toàn bộ bão trên thế giới.
    const FILTER_NW_PACIFIC_ONLY = true;

    for (const item of items) {
      const title = item.title || "";
      const description = item.description || "";
      
      // Nếu bật bộ lọc, bỏ qua các item không thuộc khu vực Tây Bắc Thái Bình Dương
      if (FILTER_NW_PACIFIC_ONLY && !title.includes("Northwest Pacific")) {
        console.log(`[Lọc khu vực] Bỏ qua mục: ${title}`);
        continue;
      }

      const txtMatches = [...description.matchAll(/href=['"]([^'"]+?([a-z]{2}[0-9]{4})(?:web)?\.txt)['"]/ig)];
      const kmzMatches = [...description.matchAll(/href=['"]([^'"]+?([a-z]{2}[0-9]{4})\.kmz)['"]/ig)];
      
      const stormsMap = {};
      
      txtMatches.forEach(match => {
         const url = match[1];
         const stormId = match[2].toLowerCase();
         if (!url.includes('prog.txt') && !url.includes('fix.txt')) {
             if (!stormsMap[stormId]) stormsMap[stormId] = {};
             stormsMap[stormId].txtUrl = url;
         }
      });
      
      kmzMatches.forEach(match => {
         const url = match[1];
         const stormId = match[2].toLowerCase();
         if (!stormsMap[stormId]) stormsMap[stormId] = {};
         stormsMap[stormId].kmzUrl = url;
      });
      
      for (const [stormId, urls] of Object.entries(stormsMap)) {
        if (!urls.txtUrl || !urls.kmzUrl) continue;
        
        const txtUrl = urls.txtUrl;
        const kmzUrl = urls.kmzUrl;
        activeStormIds.push(stormId);

        console.log(`Processing storm: ${stormId}`);

        // 1. Download & Parse Text
        let metadata = null;
        let rawText = "";
        try {
          const txtRes = await fetch(txtUrl, { headers: { "User-Agent": "Mozilla/5.0" }});
          rawText = await txtRes.text();
          metadata = parseJtwcText(rawText);
        } catch (e) {
          console.error(`Error parsing text for ${stormId}:`, e.message);
        }

        // 2. Download & Parse KMZ -> GeoJSON
        let geojson = null;
        try {
          const kmzRes = await fetch(kmzUrl, { headers: { "User-Agent": "Mozilla/5.0" }});
          const buffer = await kmzRes.arrayBuffer();
          const zip = new AdmZip(Buffer.from(buffer));
          
          const zipEntries = zip.getEntries();
          const kmlEntry = zipEntries.find(entry => entry.entryName.toLowerCase().endsWith('.kml'));
          if (kmlEntry) {
            const kmlString = kmlEntry.getData().toString('utf8');
            const kmlDom = new DOMParser().parseFromString(kmlString, "text/xml");
            const rawGeojson = unwrapGeoJSON(toGeoJSON.kml(kmlDom));
            geojson = convertStormFansToCircles(rawGeojson);
          }
        } catch (e) {
          console.error(`Error converting KMZ for ${stormId}:`, e.message);
        }

        // 3. Upsert into Supabase
        const stormData = {
          storm_id: stormId,
          name: metadata?.name || stormId,
          metadata: metadata,
          raw_text: rawText,
          geojson: geojson,
          is_active: true,
          updated_at: new Date().toISOString()
        };

        const { error } = await supabaseAdmin
          .from('jtwc_storms')
          .upsert(stormData, { onConflict: 'storm_id' });

        if (error) {
          console.error(`Supabase Upsert error for ${stormId}:`, error);
        } else {
          syncedCount++;
          console.log(`Successfully synced ${stormId}`);
        }
      }
    }

    // Đánh dấu các bão thật không còn trong RSS đợt này là inactive (giữ lại bão test/diễn tập test_*)
    if (activeStormIds.length > 0) {
      const { error: updateErr } = await supabaseAdmin
        .from('jtwc_storms')
        .update({ is_active: false })
        .not('storm_id', 'in', `(${activeStormIds.join(',')})`)
        .not('storm_id', 'like', 'test_%')
        .not('storm_id', 'like', 'mock_%');
      if (updateErr) {
        console.error("Error updating inactive storms:", updateErr);
      }
    } else {
      const { error: updateErr } = await supabaseAdmin
        .from('jtwc_storms')
        .update({ is_active: false })
        .eq('is_active', true)
        .not('storm_id', 'like', 'test_%')
        .not('storm_id', 'like', 'mock_%');
      if (updateErr) {
        console.error("Error setting real storms inactive:", updateErr);
      }
    }

    // Tự động tính toán không gian và cập nhật 3 trạng thái tuyến cáp vào Supabase (edges_status)
    try {
      await recalculateStormImpact();
    } catch (calcErr) {
      console.error("Error recalculating storm impact:", calcErr);
    }

    return { success: true, synced: syncedCount };

  } catch (error) {
    console.error("JTWC sync error:", error);
    return { success: false, error: error.message };
  }
}

export async function getActiveJtwcStorms() {
  const { data, error } = await supabaseAdmin
    .from('jtwc_storms')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error("Error fetching storms from Supabase:", error);
    throw error;
  }
  return data;
}
