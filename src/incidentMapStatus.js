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
  cableIncidents,
  stationIncidents,
  affectedRoutes = []
}) {
  if (mode === "truoc_bao") {
    const preStormEdgeStatuses = new Map();
    affectedRoutes.forEach((route) => {
      setHigherPriorityStatus(
        preStormEdgeStatuses,
        canonicalRouteKey(route.route),
        edgeStatusBeforeTyphoonFromLevel(route.riskLevel),
        PRE_STORM_EDGE_STATUS_PRIORITY
      );
    });

    return {
      edges: edges.map((edge) => ({
        ...edge,
        statusBeforeTyphoon: preStormEdgeStatuses.get(canonicalRouteKey(edge.name)) || "normal"
      })),
      nodes
    };
  }

  const edgeStatuses = new Map();
  cableIncidents.forEach((incident) => {
    setHigherPriorityStatus(
      edgeStatuses,
      canonicalRouteKey(incident.target),
      edgeStatusFromIncident(incident.status),
      EDGE_STATUS_PRIORITY
    );
  });

  const affectedRouteKeys = new Set(
    affectedRoutes
      .map((route) => canonicalRouteKey(route.route))
      .filter(Boolean)
  );

  const nodeStatuses = new Map();
  stationIncidents.forEach((incident) => {
    setHigherPriorityStatus(
      nodeStatuses,
      stationKey(incident.target),
      nodeStatusFromCause(incident.cause),
      NODE_STATUS_PRIORITY
    );
  });

  return {
    edges: edges.map((edge) => {
      const routeKey = canonicalRouteKey(edge.name);
      const incidentStatus = edgeStatuses.get(routeKey);
      return {
        ...edge,
        status: incidentStatus === "incident_external"
          ? "incident_external"
          : affectedRouteKeys.has(routeKey)
            ? "resolved"
            : "normal"
      };
    }),
    nodes: nodes.map((node) => ({
      ...node,
      status: nodeStatuses.get(stationKey(node.name)) || "active"
    }))
  };
}
