function normalizedStatus(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi-VN")
    .replace(/đ/g, "d")
    .trim();
}

function percentage(count, total) {
  if (!total) return "0%";
  const value = (count / total) * 100;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function incidentStatusBreakdown(incidents) {
  const counts = incidents.reduce((result, incident) => {
    if (!String(incident.code || "").trim()) return result;

    const status = normalizedStatus(incident.status);
    if (status.includes("hoan thanh")) {
      result.completed += 1;
      result.total += 1;
    } else if (status.includes("chua tiep can")) {
      result.unreachable += 1;
      result.total += 1;
    } else if (status.includes("chua xu ly") || status.includes("dang xu ly")) {
      result.unprocessed += 1;
      result.total += 1;
    }
    return result;
  }, { total: 0, completed: 0, unprocessed: 0, unreachable: 0 });

  const total = counts.total;
  return {
    total,
    completed: { count: counts.completed, percent: percentage(counts.completed, total) },
    unprocessed: { count: counts.unprocessed, percent: percentage(counts.unprocessed, total) },
    unreachable: { count: counts.unreachable, percent: percentage(counts.unreachable, total) }
  };
}
