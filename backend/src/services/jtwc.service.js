import { XMLParser } from "fast-xml-parser";
import AdmZip from "adm-zip";
import { DOMParser } from "@xmldom/xmldom";
import * as toGeoJSON from "@tmcw/togeojson";
import { parseJtwcText } from "../utils/jtwcParser.js";
import { supabaseAdmin } from "../config/supabase.js";

const RSS_URL = "https://www.metoc.navy.mil/jtwc/rss/jtwc.rss";

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

    for (const item of items) {
      const description = item.description || "";
      
      // Tìm link TXT và KMZ
      const txtMatch = description.match(/href=['"]([^'"]+\.txt)['"]/i);
      const kmzMatch = description.match(/href=['"]([^'"]+\.kmz)['"]/i);
      
      if (txtMatch && kmzMatch) {
        const txtUrl = txtMatch[1];
        const kmzUrl = kmzMatch[1];
        
        // Extract storm_id (vd: ep0626 từ ep0626web.txt)
        const stormIdMatch = txtUrl.match(/\/([a-z0-9]+)web\.txt/i) || txtUrl.match(/\/([a-z0-9]+)\.txt/i);
        if (!stormIdMatch) continue;
        const stormId = stormIdMatch[1].toLowerCase();
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
            geojson = toGeoJSON.kml(kmlDom);
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

    // Đánh dấu các bão không còn trong RSS đợt này là inactive
    if (activeStormIds.length > 0) {
      const { error: updateErr } = await supabaseAdmin
        .from('jtwc_storms')
        .update({ is_active: false })
        .not('storm_id', 'in', `(${activeStormIds.join(',')})`);
      if (updateErr) {
        console.error("Error updating inactive storms:", updateErr);
      }
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
