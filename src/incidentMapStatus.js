import { normalizeIncidentText } from "./incidentUtils.js";

const EDGE_STATUS_PRIORITY = {
  resolved: 1,
  incident_external: 2
};

const PRE_STORM_EDGE_STATUS_PRIORITY = {
  safe: 1,
  risky: 2,
  unsafe: 3
};

const NODE_STATUS_PRIORITY = {
  active: 0,
  power_out: 1,
  isolated: 2
};

function cleanRouteEndpoint(value) {
  return String(value || "")
    .replace(/\(\s*MPOP\s*\)/gi, "")
    .replace(/\b\d+\s*FO\b/gi, "")
    .replace(/\s+/g, "")
    .toLocaleUpperCase("vi-VN");
}

export function canonicalRouteKey(value) {
  const endpoints = String(value || "")
    .normalize("NFKC")
    .replace(/^tuyến\s+/i, "")
    .split(/\s*[-–—]\s*/)
    .map(cleanRouteEndpoint)
    .filter(Boolean);

  return endpoints.length === 2
    ? endpoints.sort((left, right) => left.localeCompare(right)).join("-")
    : endpoints.join("-");
}

export function stationKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/^trạm\s+/i, "")
    .replace(/\(\s*MPOP\s*\)/gi, "")
    .replace(/\s+/g, "")
    .toLocaleUpperCase("vi-VN");
}

export function edgeStatusFromIncident(value) {
  const status = normalizeIncidentText(value);
  if (
    status.includes("chua tiep can")
    || status.includes("dang xu ly")
    || status.includes("dang xu li")
  ) return "incident_external";
  if (status.includes("hoan thanh")) return "resolved";
  return null;
}

function incidentNumberValue(value) {
  return Number(String(value || "").replace(/[^\d.-]/g, "")) || 0;
}

export function summarizeActiveStormImpact({ affectedRoutes = [], cableIncidents = [] }) {
  const activeRouteKeys = new Set(
    cableIncidents
      .filter((incident) => edgeStatusFromIncident(incident.status) === "incident_external")
      .map((incident) => canonicalRouteKey(incident.target))
      .filter(Boolean)
  );

  return affectedRoutes.reduce((summary, route) => {
    if (!activeRouteKeys.has(canonicalRouteKey(route.route))) return summary;

    const popCount = incidentNumberValue(route.pops);
    const impact = normalizeIncidentText(route.impact);
    summary.popCount += popCount;
    summary.ftiCustomerCount += incidentNumberValue(route.ftiCustomers);
    if (impact.includes("truc tiep")) summary.directPopCount += popCount;
    if (impact.includes("gian tiep")) summary.indirectPopCount += popCount;
    return summary;
  }, {
    popCount: 0,
    directPopCount: 0,
    indirectPopCount: 0,
    ftiCustomerCount: 0
  });
}

export function edgeStatusBeforeTyphoonFromLevel(value) {
  const level = normalizeIncidentText(value);
  if (level.includes("mat an toan")) return "unsafe";
  if (level.includes("co nguy co")) return "risky";
  if (level.includes("an toan")) return "safe";
  return null;
}

export function nodeStatusFromCause(value) {
  const cause = normalizeIncidentText(value);
  if (cause.includes("co lap")) return "isolated";
  if (cause.includes("mat dien")) return "power_out";
  return "active";
}

export function nodeStatusFromIncident(cause, status) {
  if (normalizeIncidentText(status).includes("hoan thanh")) return "active";
  return nodeStatusFromCause(cause);
}

function setHigherPriorityStatus(statuses, key, status, priorities) {
  if (!key || !status) return;
  const currentStatus = statuses.get(key);
  if (!currentStatus || priorities[status] > priorities[currentStatus]) {
    statuses.set(key, status);
  }
}

export function deriveIncidentMapFeatures({
  mode,
  edges,
  nodes,
  cableIncidents = [],
  stationIncidents = []
}) {
  const edgeIncidentStatuses = new Map();
  const nodeStatuses = new Map();

  if (mode === "trong_bao") {
    cableIncidents.forEach((incident) => {
      setHigherPriorityStatus(
        edgeIncidentStatuses,
        canonicalRouteKey(incident.target),
        edgeStatusFromIncident(incident.status),
        EDGE_STATUS_PRIORITY
      );
    });

    stationIncidents.forEach((incident) => {
      setHigherPriorityStatus(
        nodeStatuses,
        stationKey(incident.target),
        nodeStatusFromIncident(incident.cause, incident.status),
        NODE_STATUS_PRIORITY
      );
    });
  }

  return {
    edges: edges.map((edge) => ({
      ...edge,
      // Đảm bảo màu sắc nét vẽ tuyến luôn giữ theo bán kính bão (normal / unsafe / risky)
      status: edge.status || "normal",
      statusBeforeTyphoon: edge.statusBeforeTyphoon || edge.status || "normal",
      // Đặt icon dấu X (incident_external) hoặc dấu Check V (resolved) theo sự cố từ Sheet SC ngoại vi
      cableIncidentStatus: edgeIncidentStatuses.get(canonicalRouteKey(edge.name)) || null
    })),
    nodes: nodes.map((node) => ({
      ...node,
      status: mode === "truoc_bao" ? "active" : (nodeStatuses.get(stationKey(node.name)) || "active"),
      anhHuong: node.anhHuong || "normal"
    }))
  };
}
