function apiErrorMessage(payload, status) {
  const error = payload?.error;
  if (!error) return `Backend trả mã HTTP ${status}`;

  if (error.code === "SHEET_SCHEMA_INVALID") {
    const suggestions = error.suggestions?.length ? ` ${error.suggestions.join(" ")}` : "";
    return `${error.message}.${suggestions}`;
  }

  return error.message || `Backend trả mã HTTP ${status}`;
}

const DASHBOARD_VISIBLE_MARKERS = new Set(["x", "✓", "✔", "true", "1", "có"]);

export function isDashboardVisible(value) {
  const marker = String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("vi-VN");
  return DASHBOARD_VISIBLE_MARKERS.has(marker);
}

export function visibleDashboardDeployments(deployments) {
  if (!Array.isArray(deployments)) return [];
  return deployments.filter((deployment) => isDashboardVisible(deployment?.visible));
}

export async function loadDashboardData() {
  const response = await fetch("/api/dashboard", { cache: "no-store" });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new Error(apiErrorMessage(payload, response.status));
  }

  if (payload.warnings?.length) console.warn("Cảnh báo dữ liệu Google Sheet:", payload.warnings);
  return payload.data;
}
