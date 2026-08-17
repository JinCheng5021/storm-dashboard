import * as turf from "@turf/turf";

// =========================================================================
// ⚙️ CẤU HÌNH LỌC CÁC MỐC THỜI GIAN DỰ BÁO BÃO TRÊN BẢN ĐỒ
// =========================================================================
// Đổi biến này thành `true` nếu CHỈ muốn vẽ các mốc: 12h, 24h, 48h, 72h (và vị trí hiện tại 0h).
// Đổi thành `false` nếu muốn vẽ TOÀN BỘ các mốc dự báo (bao gồm 36h, 60h, 96h, 120h,...).
export const FILTER_SPECIFIC_FORECAST_HOURS_ONLY = true;

// Danh sách các mốc giờ dự báo được phép vẽ khi bật bộ lọc (0 là vị trí cảnh báo hiện tại)
export const ALLOWED_FORECAST_HOURS = [0, 24, 48, 72, 96];

/**
 * Chuyển đổi chuỗi thời gian UTC sang giờ Việt Nam (UTC+7) định dạng HH:mm DD/MM
 */
export function formatToVietnamTime(timeStr, text) {
  if (!timeStr && !text) return '';
  const combined = `${timeStr || ''} ${text || ''}`;

  // 1. Khớp chuỗi thời gian đầy đủ YYYYMMDDHH (ví dụ 2026081712Z hoặc 2026081000)
  const fullMatch = combined.match(/(\d{4})(\d{2})(\d{2})(\d{2})Z?/);
  if (fullMatch) {
    const year = parseInt(fullMatch[1], 10);
    const month = parseInt(fullMatch[2], 10) - 1;
    const day = parseInt(fullMatch[3], 10);
    const hour = parseInt(fullMatch[4], 10);

    const utcDate = new Date(Date.UTC(year, month, day, hour, 0));
    const vnDate = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000);
    const vnHours = String(vnDate.getUTCHours()).padStart(2, '0');
    const vnMinutes = String(vnDate.getUTCMinutes()).padStart(2, '0');
    const vnDay = String(vnDate.getUTCDate()).padStart(2, '0');
    const vnMonth = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
    return `${vnHours}:${vnMinutes} ${vnDay}/${vnMonth}`;
  }

  // 2. Khớp chuỗi DDHH00Z hoặc DDHHMMZ (ví dụ 170000Z POSIT hoặc 091200Z POSIT)
  const ddHhMmMatch = combined.match(/\b(\d{2})(\d{2})(?:00)?Z\b/i);
  if (ddHhMmMatch) {
    const day = parseInt(ddHhMmMatch[1], 10);
    const hour = parseInt(ddHhMmMatch[2], 10);
    const now = new Date();
    const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, 0));
    const vnDate = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000);
    const vnHours = String(vnDate.getUTCHours()).padStart(2, '0');
    const vnMinutes = String(vnDate.getUTCMinutes()).padStart(2, '0');
    const vnDay = String(vnDate.getUTCDate()).padStart(2, '0');
    const vnMonth = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
    return `${vnHours}:${vnMinutes} ${vnDay}/${vnMonth}`;
  }

  // 3. Khớp chuỗi DD/HHZ (ví dụ 17/12Z, 09/12Z, 18/00Z)
  const ddHhMatch = combined.match(/(\d{1,2})\/(\d{2})Z?/i);
  if (ddHhMatch) {
    const day = parseInt(ddHhMatch[1], 10);
    const hour = parseInt(ddHhMatch[2], 10);
    const now = new Date();
    const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, 0));
    const vnDate = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000);
    const vnHours = String(vnDate.getUTCHours()).padStart(2, '0');
    const vnMinutes = String(vnDate.getUTCMinutes()).padStart(2, '0');
    const vnDay = String(vnDate.getUTCDate()).padStart(2, '0');
    const vnMonth = String(vnDate.getUTCMonth() + 1).padStart(2, '0');
    return `${vnHours}:${vnMinutes} ${vnDay}/${vnMonth}`;
  }

  return '';
}

/**
 * Chuyển đổi các polygon hình quạt bán kính gió của JTWC thành hình tròn hoàn hảo 360 độ
 * với bán kính bằng bán kính lớn nhất trong 4 góc phần tư.
 * 
 * Đồng thời:
 * - Phân loại mức độ rủi ro (risk_level: 'direct' | 'indirect' | 'cone')
 * - Lọc hiển thị chỉ vẽ các mốc giờ chỉ định nếu `FILTER_SPECIFIC_FORECAST_HOURS_ONLY === true`
 * - Gán nhãn thời gian Việt Nam (label) và icon flag (is_current_center / is_forecast_center)
 */
export function convertStormFansToCircles(geojson) {
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    return geojson;
  }

  let currentTau = null;
  let currentCenter = null;
  const convertedFeatures = [];

  for (const feature of geojson.features) {
    const geomType = feature.geometry?.type;
    const descText = typeof feature.properties?.description === 'object' 
      ? (feature.properties?.description?.value || '') 
      : String(feature.properties?.description || '');
    const propName = String(feature.properties?.name || '');
    const combinedText = `${propName} ${descText}`.toUpperCase();

    // A. Nếu là Point: Xác định mốc thời gian dự báo (TAU) và nhãn thời gian
    if (geomType === 'Point') {
      const tauMatch = combinedText.match(/TAU\s*(\d+)/i);
      if (tauMatch) {
        currentTau = parseInt(tauMatch[1], 10);
      } else if (
        combinedText.includes('WARNING NR') || 
        combinedText.includes('WARNING #') || 
        combinedText.includes('WARNING POSITION') || 
        combinedText.includes('PRESENT WIND') ||
        combinedText.includes('POSIT:')
      ) {
        currentTau = 0;
      } else {
        // Điểm lịch sử (Past track)
        currentTau = null;
      }

      if (Array.isArray(feature.geometry.coordinates)) {
        currentCenter = feature.geometry.coordinates;
      }
    }

    // B. Nếu là LineString (đường đi bão): Luôn giữ lại
    if (geomType === 'LineString' || geomType === 'MultiLineString') {
      convertedFeatures.push(feature);
      continue;
    }

    // C. Nếu là Forecast Cone / Danger Swath: Luôn giữ lại
    const isCone = combinedText.includes('SWATH') || 
                   combinedText.includes('CONE') || 
                   combinedText.includes('DANGER') || 
                   combinedText.includes('TRACK');

    if (isCone) {
      convertedFeatures.push({
        ...feature,
        properties: {
          ...feature.properties,
          risk_level: 'cone'
        }
      });
      continue;
    }

    // D. Áp dụng bộ lọc mốc giờ dự báo (nếu bật)
    if (FILTER_SPECIFIC_FORECAST_HOURS_ONLY && currentTau !== null && !ALLOWED_FORECAST_HOURS.includes(currentTau)) {
      // Bỏ qua các mốc không nằm trong danh sách (như 36h, 60h, 96h, 120h)
      continue;
    }

    // E. Nếu là Polygon bán kính gió: Vẽ lại thành hình tròn 360 độ hoàn hảo
    if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      let riskLevel = 'indirect';
      const isDirect = combinedText.includes('64 KT') ||
                       combinedText.includes('50 KT') ||
                       combinedText.includes('64KT') ||
                       combinedText.includes('50KT') ||
                       combinedText.includes('64 KNOT') ||
                       combinedText.includes('50 KNOT') ||
                       combinedText.includes('RADIUS OF 50') ||
                       combinedText.includes('RADIUS OF 64') ||
                       feature.properties?.wind_threshold === 50 ||
                       feature.properties?.wind_threshold === 64;

      if (isDirect) {
        riskLevel = 'direct';
      }

      let maxRadiusKm = 0;

      // Cách 1: Đọc từ radii_nm nếu có
      if (feature.properties?.radii_nm && typeof feature.properties.radii_nm === 'object') {
        const nmValues = Object.values(feature.properties.radii_nm)
          .filter((v) => typeof v === 'number' && v > 0);
        if (nmValues.length > 0) {
          const maxNm = Math.max(...nmValues);
          maxRadiusKm = maxNm * 1.852;
        }
      }

      // Cách 2: Tính khoảng cách từ tâm đến các đỉnh của hình quạt
      if (maxRadiusKm <= 0 && currentCenter) {
        try {
          const coords = geomType === 'Polygon' 
            ? feature.geometry.coordinates[0] 
            : feature.geometry.coordinates.flat(1);

          if (Array.isArray(coords)) {
            for (const coord of coords) {
              if (Array.isArray(coord) && typeof coord[0] === 'number') {
                const d = turf.distance(currentCenter, coord, { units: 'kilometers' });
                if (d > maxRadiusKm) {
                  maxRadiusKm = d;
                }
              }
            }
          }
        } catch (err) {
          console.warn("[StormGeometry] Lỗi tính khoảng cách đỉnh polygon:", err.message);
        }
      }

      if (maxRadiusKm > 0 && currentCenter) {
        const circleFeature = turf.circle(currentCenter, maxRadiusKm, {
          steps: 64,
          units: 'kilometers',
          properties: {
            ...feature.properties,
            max_radius_km: Math.round(maxRadiusKm * 10) / 10,
            risk_level: riskLevel,
            forecast_tau: currentTau
          }
        });
        convertedFeatures.push(circleFeature);
        continue;
      }
    }

    // F. Xử lý các Feature Point (Tâm bão hiện tại và các mốc dự báo)
    if (geomType === 'Point') {
      const vnTime = formatToVietnamTime(feature.properties?.time, `${propName} ${descText}`);
      let label = '';
      let isCurrentCenter = false;
      let isForecastCenter = false;
      let isStormCenter = false;

      if (currentTau === 0) {
        label = vnTime ? `Hiện tại (${vnTime})` : `Hiện tại`;
        isCurrentCenter = true;
        isStormCenter = true;
      } else if (typeof currentTau === 'number') {
        label = vnTime ? `+${currentTau}h (${vnTime})` : `+${currentTau}h`;
        isForecastCenter = true;
        isStormCenter = true;
      }

      if (isStormCenter) {
        convertedFeatures.push({
          ...feature,
          properties: {
            ...feature.properties,
            forecast_tau: currentTau,
            vn_time: vnTime,
            label: label,
            is_current_center: isCurrentCenter,
            is_forecast_center: isForecastCenter,
            is_storm_center: true,
            point_type: 'storm_center'
          }
        });
      } else {
        // Điểm quá khứ (Past track) - không gán icon bão và không gắn label
        convertedFeatures.push({
          ...feature,
          properties: {
            ...feature.properties,
            is_storm_center: false,
            is_current_center: false,
            is_forecast_center: false,
            point_type: 'past_track'
          }
        });
      }
      continue;
    }

    convertedFeatures.push(feature);
  }

  return {
    ...geojson,
    features: convertedFeatures
  };
}
