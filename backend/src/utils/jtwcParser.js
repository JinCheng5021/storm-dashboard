export function parseJtwcText(rawText) {
  const result = {
    name: '',
    position: '',
    maxSustainedWindsKmH: null,
    gustsKmH: null,
    direction: '',
    speedKmH: null,
    pressureMb: null,
    issueTime: '',
    raw_text: rawText
  };

  // 1. Tên bão & Số hiệu
  const nameMatch = rawText.match(/(?:SUBJ\/|1\.\s+)(.*?)\s+WARNING NR/i);
  if (nameMatch) result.name = nameMatch[1].trim();

  // 2. Vị trí
  const posMatch = rawText.match(/NEAR\s+([0-9.]+N\s+[0-9.]+W)/);
  if (posMatch) result.position = posMatch[1].trim();

  // 3. Sức gió & Gió giật (Convert Knot -> km/h: 1 kt = 1.852 km/h)
  const windMatch = rawText.match(/MAX SUSTAINED WINDS\s+-\s+([0-9]+)\s+KT,\s+GUSTS\s+([0-9]+)\s+KT/);
  if (windMatch) {
    result.maxSustainedWindsKmH = Math.round(parseInt(windMatch[1]) * 1.852);
    result.gustsKmH = Math.round(parseInt(windMatch[2]) * 1.852);
  }

  // 4. Hướng & Tốc độ
  const moveMatch = rawText.match(/MOVEMENT PAST SIX HOURS\s+-\s+([0-9]+)\s+DEGREES\s+AT\s+([0-9]+)\s+KTS/);
  if (moveMatch) {
    result.direction = moveMatch[1] + "°";
    result.speedKmH = Math.round(parseInt(moveMatch[2]) * 1.852);
  }

  // 5. Áp suất
  const presMatch = rawText.match(/MINIMUM CENTRAL PRESSURE.*?IS\s+([0-9]+)\s+MB/i);
  if (presMatch) result.pressureMb = parseInt(presMatch[1]);

  // 6. Thời gian phát hành
  const timeMatch = rawText.match(/([0-9]{6}Z)\s+---\s+NEAR/);
  if (timeMatch) result.issueTime = timeMatch[1];

  return result;
}
