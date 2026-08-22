function stormIdentity(storm) {
  return [storm?.storm_id, storm?.name, storm?.metadata?.name]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLocaleUpperCase("vi-VN");
}

export function isStormHiddenOnDashboard(storm) {
  return stormIdentity(storm).includes("SAUDEL");
}

export function stormDisplayName(storm) {
  const identity = stormIdentity(storm);
  const stormId = String(storm?.storm_id || "").trim().toUpperCase();
  const isStorm18W = /\b18W\b/.test(identity)
    || /\bEIGHTEEN\b/.test(identity)
    || /^WP18\d{2}$/.test(stormId);

  if (isStorm18W) return "BÃO SỐ 4 (NARRA)";
  return storm?.name || storm?.metadata?.name || stormId;
}

export function visibleDashboardStorms(storms) {
  if (!Array.isArray(storms)) return [];
  return storms.filter((storm) => !isStormHiddenOnDashboard(storm));
}
