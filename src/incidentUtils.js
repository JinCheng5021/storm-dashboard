export function normalizeIncidentText(value) {
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

    const status = normalizeIncidentText(incident.status);
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

function incidentNumberValue(value) {
  return Number(String(value || "").replace(/[^\d.-]/g, "")) || 0;
}

function incidentDurationSeconds(value) {
  const text = String(value || "").trim();
  if (!text) return 0;

  const parts = text.split(":").map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return (parts[0] * 60 * 60) + (parts[1] * 60) + parts[2];
  }
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return (parts[0] * 60 * 60) + (parts[1] * 60);
  }

  const hours = Number(text.replace(",", "."));
  return Number.isFinite(hours) ? hours * 60 * 60 : 0;
}

function formatIncidentDuration(totalSeconds) {
  if (!totalSeconds) return "-";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function summarizeRouteIncidents(incidents = []) {
  const summary = incidents.reduce((result, incident) => {
    result.incidentCount += incidentNumberValue(incident.incidentCount);
    result.processingSeconds += incidentDurationSeconds(incident.processingTime);
    String(incident.location || "")
      .split(/\r?\n/)
      .map((location) => location.trim())
      .filter(Boolean)
      .forEach((location) => result.locations.push(location));
    return result;
  }, {
    incidentCount: 0,
    processingSeconds: 0,
    locations: []
  });

  return {
    recordCount: incidents.length,
    incidentCount: summary.incidentCount,
    location: summary.locations.join("\n"),
    processingTime: formatIncidentDuration(summary.processingSeconds)
  };
}
