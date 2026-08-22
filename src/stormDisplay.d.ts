export interface DashboardStorm {
  storm_id?: unknown;
  name?: unknown;
  metadata?: { name?: unknown } | null;
  [key: string]: unknown;
}

export function isStormHiddenOnDashboard(storm: DashboardStorm | null | undefined): boolean;
export function stormDisplayName(storm: DashboardStorm | null | undefined): string;
export function visibleDashboardStorms(storms: DashboardStorm[] | null | undefined): DashboardStorm[];
