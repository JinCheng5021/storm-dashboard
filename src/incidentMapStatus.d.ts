import type { DashboardMode, EdgeFeature, NodeFeature } from "./types";

interface CableIncident {
  target?: unknown;
  status?: unknown;
}

interface StationIncident {
  target?: unknown;
  cause?: unknown;
}

interface AffectedRoute {
  route?: unknown;
  riskLevel?: unknown;
}

export function canonicalRouteKey(value: unknown): string;
export function stationKey(value: unknown): string;
export function edgeStatusFromIncident(
  value: unknown
): "incident_external" | "danger_zone" | "resolved" | null;
export function edgeStatusBeforeTyphoonFromLevel(
  value: unknown
): "safe" | "risky" | "unsafe" | null;
export function nodeStatusFromCause(
  value: unknown
): "active" | "power_out" | "isolated";
export function deriveIncidentMapFeatures(options: {
  mode: DashboardMode;
  edges: EdgeFeature[];
  nodes: NodeFeature[];
  cableIncidents: CableIncident[];
  stationIncidents: StationIncident[];
  affectedRoutes?: AffectedRoute[];
}): {
  edges: EdgeFeature[];
  nodes: NodeFeature[];
};
