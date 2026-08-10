import { useCallback, useEffect, useMemo, useRef, useState, useReducer } from "react";
import vietmapgl from "@vietmap/vietmap-gl-js";
import * as htmlToImage from "html-to-image";
import { loadDashboardData, visibleDashboardDeployments } from "./dashboardData";
import { MapCanvas } from "./components/MapCanvas";
import { ContextMenu } from "./components/ContextMenu";
import { parseGeoJSON } from "./data/geojsonParser";
import { mapReducer, EMPTY_MAP_STATE, haversine } from "./mapState";
import { exportMapImage } from "./utils/exportMap";
import { supabase } from "./lib/supabase";
import { numberedTaskName, tasksForDate } from "./taskUtils";
import { incidentStatusBreakdown } from "./incidentUtils";
import { canonicalRouteKey, deriveIncidentMapFeatures, edgeStatusFromIncident, stationKey, summarizeActiveStormImpact } from "./incidentMapStatus";
import type { NodeStatus, EdgeStatus, Team, TeamType, DashboardMode } from "./types";

const PAGE_SIZE = {
  cable: 4,
  station: 3,
  weather: 99,
  tasks: 4
};

const DASHBOARD_AUTO_REFRESH_MS = 60_000;

const ACCENT_STYLE: any = {
  blue: { "--accent": "var(--fpt-blue)", "--accent-rgb": "0, 91, 172" },
  orange: { "--accent": "var(--fpt-orange)", "--accent-rgb": "244, 124, 32" },
  green: { "--accent": "var(--fpt-green)", "--accent-rgb": "109, 179, 63" },
  red: { "--accent": "var(--danger)", "--accent-rgb": "239, 68, 68" },
  purple: { "--accent": "#7c3aed", "--accent-rgb": "124, 58, 237" },
  teal: { "--accent": "#0f9f8f", "--accent-rgb": "15, 159, 143" }
};

function chipClass(status) {
  const lower = String(status || "").toLowerCase();
  if (lower.includes("hoàn thành") || lower.includes("an toàn") || lower.includes("bình thường") || lower.includes("ổn định")) return "chip-green";
  if (lower.includes("đang xử lý") || lower.includes("đang thực hiện") || lower.includes("mưa") || lower.includes("ảnh hưởng gián tiếp") || lower.includes("theo dõi")) return "chip-orange";
  if (lower.includes("chưa") || lower.includes("mất") || lower.includes("đứt") || lower.includes("rủi ro") || lower.includes("hạn chế")) return "chip-red";
  return "chip-blue";
}

function StatusChip({ status }) {
  const label = status || "Chưa cập nhật";
  return <span className={`chip ${chipClass(label)}`} title={label}>{label}</span>;
}

function weatherIcon(weather) {
  const lower = String(weather || "").toLowerCase();
  if (lower.includes("mưa")) return "🌧️";
  if (lower.includes("mây")) return "☁️";
  if (lower.includes("nắng")) return "☀️";
  return "🌦️";
}

function vietnamDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function taskStatusMeta(status) {
  const label = String(status || "Chưa thực hiện").trim();
  const lower = label.toLocaleLowerCase("vi-VN");
  if (lower.includes("hoàn thành")) return { label, className: "task-completed", icon: "check_circle" };
  if (lower.includes("đang thực hiện")) return { label, className: "task-in-progress", icon: "pending" };
  return { label, className: "task-not-started", icon: "cancel" };
}

function pageItems(items, page, size) {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * size;
  return {
    rows: items.slice(start, start + size),
    start,
    page: safePage,
    pageCount,
    total: items.length
  };
}

function Pager({ page, setPage, total, size }) {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pageCount - 1);
  if (pageCount <= 1) return null;

  return (
    <div className="pager">
      <button onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage <= 0} title="Trang trước">
        <span className="material-symbols-outlined text-[16px]">chevron_left</span>
      </button>
      <span>{total ? safePage + 1 : 0}/{total ? pageCount : 0}</span>
      <button onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage >= pageCount - 1 || !total} title="Trang sau">
        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
      </button>
    </div>
  );
}

function IncidentChart({ type, incidents, href }) {
  const breakdown = incidentStatusBreakdown(incidents);
  const completedEnd = breakdown.total ? (breakdown.completed.count / breakdown.total) * 100 : 0;
  const unprocessedEnd = breakdown.total
    ? ((breakdown.completed.count + breakdown.unprocessed.count) / breakdown.total) * 100
    : 0;
  const isStation = type === "station";
  const accentStyle = isStation ? ACCENT_STYLE.blue : ACCENT_STYLE.orange;
  const chartStyle = {
    background: breakdown.total
      ? `conic-gradient(var(--fpt-green) 0 ${completedEnd}%, var(--fpt-orange) ${completedEnd}% ${unprocessedEnd}%, var(--danger) ${unprocessedEnd}% 100%)`
      : "#e2e8f0"
  };

  return (
    <article className="summary-card chart-card" style={accentStyle}>
      <a href={href} target="_blank" rel="noreferrer" className="sheet-link" title="Mở file Google Sheet">
        <span className="material-symbols-outlined">open_in_new</span>
      </a>
      <div className="chart-card-header">
        <div className="summary-icon">
          <span className="material-symbols-outlined text-[20px]">{isStation ? "router" : "cable"}</span>
        </div>
        <p className="summary-label">{isStation ? "Sự cố đài trạm" : "Sự cố ngoại vi"}</p>
      </div>
      <div className="chart-card-body">
        <div className="pie-wrap">
          <div className="pie-chart" style={chartStyle}></div>
          <p className="pie-total">{breakdown.total}</p>
        </div>
        <div className="pie-meta">
          <div className="pie-legend">
            <div className="pie-legend-row"><span className="pie-legend-label"><i className="legend-dot dot-green"></i>Hoàn thành</span><span className="pie-legend-value"><strong>{breakdown.completed.count}</strong><small>{breakdown.completed.percent}</small></span></div>
            <div className="pie-legend-row"><span className="pie-legend-label"><i className="legend-dot dot-orange"></i>Chưa xử lý</span><span className="pie-legend-value"><strong>{breakdown.unprocessed.count}</strong><small>{breakdown.unprocessed.percent}</small></span></div>
            <div className="pie-legend-row"><span className="pie-legend-label"><i className="legend-dot dot-red"></i>Chưa tiếp cận</span><span className="pie-legend-value"><strong>{breakdown.unreachable.count}</strong><small>{breakdown.unreachable.percent}</small></span></div>
          </div>
        </div>
      </div>
    </article>
  );
}

function PreStormImpactChart({ data, isLoading }: any) {
  const SHEET_BASE_URL = `https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_GOOGLE_SHEET_ID || "1fTDLSaxfzLU4XZnPwVhLqIdFNX4-1SdSMpdvyO372nk"}/edit#gid=763532233`;

  if (isLoading || !data) {
    return (
      <article className="summary-card chart-card flex items-center justify-center" style={ACCENT_STYLE.red}>
        <a href={SHEET_BASE_URL} target="_blank" rel="noreferrer" className="sheet-link" title="Mở file Google Sheet">
          <span className="material-symbols-outlined">open_in_new</span>
        </a>
        <p className="summary-label text-center">SL POP có nguy cơ<br/><span className="text-sm font-normal text-slate-400">(Đang tải dữ liệu...)</span></p>
      </article>
    );
  }

  const { directCount, indirectCount, totalPop } = data;
  const totalCount = directCount + indirectCount;
  const directEnd = totalCount ? (directCount / totalCount) * 100 : 0;

  const chartStyle = {
    background: totalCount
      ? `conic-gradient(var(--fpt-orange) 0 ${directEnd}%, var(--fpt-green) ${directEnd}% 100%)`
      : "#e2e8f0"
  };

  return (
    <article className="summary-card chart-card" style={ACCENT_STYLE.red}>
      <a href={SHEET_BASE_URL} target="_blank" rel="noreferrer" className="sheet-link" title="Mở file Google Sheet">
        <span className="material-symbols-outlined">open_in_new</span>
      </a>
      <div className="chart-card-header">
        <div className="summary-icon">
          <span className="material-symbols-outlined text-[20px]">router</span>
        </div>
        <p className="summary-label">SL POP có nguy cơ</p>
      </div>
      <div className="chart-card-body">
        <div className="pie-wrap">
          <div className="pie-chart" style={chartStyle}></div>
          <p className="pie-total">{totalPop}</p>
        </div>
        <div className="pie-meta">
          <div className="pie-legend">
            <div className="pie-legend-row"><span className="pie-legend-label"><i className="legend-dot dot-orange"></i>Trực tiếp</span><span className="pie-legend-value"><strong>{directCount}</strong></span></div>
            <div className="pie-legend-row"><span className="pie-legend-label"><i className="legend-dot dot-green"></i>Gián tiếp</span><span className="pie-legend-value"><strong>{indirectCount}</strong></span></div>
          </div>
        </div>
      </div>
    </article>
  );
}

function PreStormRouteChart({ data, isLoading }: any) {
  const SHEET_BASE_URL = `https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_GOOGLE_SHEET_ID || "1fTDLSaxfzLU4XZnPwVhLqIdFNX4-1SdSMpdvyO372nk"}/edit#gid=763532233`;

  if (isLoading || !data) {
    return (
      <article className="summary-card chart-card flex items-center justify-center" style={{ "--accent": "#9b51d0", "--accent-rgb": "155, 81, 208" } as any}>
        <a href={SHEET_BASE_URL} target="_blank" rel="noreferrer" className="sheet-link" title="Mở file Google Sheet">
          <span className="material-symbols-outlined">open_in_new</span>
        </a>
        <p className="summary-label text-center">SL tuyến có nguy cơ<br/><span className="text-sm font-normal text-slate-400">(Đang tải dữ liệu...)</span></p>
      </article>
    );
  }

  const { directCount, directLength, indirectCount, indirectLength } = data;
  const totalCount = directCount + indirectCount;
  const directEnd = totalCount ? (directCount / totalCount) * 100 : 0;
  const chartStyle = {
    background: totalCount
      ? `conic-gradient(var(--fpt-orange) 0 ${directEnd}%, var(--fpt-green) ${directEnd}% 100%)`
      : "#e2e8f0"
  };

  return (
    <article className="summary-card chart-card" style={{ "--accent": "#9b51d0", "--accent-rgb": "155, 81, 208" } as any}>
      <a href={SHEET_BASE_URL} target="_blank" rel="noreferrer" className="sheet-link" title="Mở file Google Sheet">
        <span className="material-symbols-outlined">open_in_new</span>
      </a>
      <div className="chart-card-header">
        <div className="summary-icon">
          <span className="material-symbols-outlined text-[20px]">cable</span>
        </div>
        <p className="summary-label">SL tuyến có nguy cơ</p>
      </div>
      <div className="chart-card-body">
        <div className="pie-wrap">
          <div className="pie-chart" style={chartStyle}></div>
          <p className="pie-total">{totalCount}</p>
        </div>
        <div className="pie-meta">
          <div className="pie-legend">
            <div className="pie-legend-row"><span className="pie-legend-label"><i className="legend-dot dot-orange"></i>Trực tiếp</span><span className="pie-legend-value"><strong>{directCount}</strong><small>{directLength.toFixed(1)} km</small></span></div>
            <div className="pie-legend-row"><span className="pie-legend-label"><i className="legend-dot dot-green"></i>Gián tiếp</span><span className="pie-legend-value"><strong>{indirectCount}</strong><small>{indirectLength.toFixed(1)} km</small></span></div>
          </div>
        </div>
      </div>
    </article>
  );
}

function PreStormStationChart({ data, isLoading }: any) {
  const SHEET_BASE_URL = `https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_GOOGLE_SHEET_ID || "1fTDLSaxfzLU4XZnPwVhLqIdFNX4-1SdSMpdvyO372nk"}/edit#gid=763532233`;

  if (isLoading || !data) {
    return (
      <article className="summary-card chart-card flex items-center justify-center" style={ACCENT_STYLE.orange}>
        <a href={SHEET_BASE_URL} target="_blank" rel="noreferrer" className="sheet-link" title="Mở file Google Sheet">
          <span className="material-symbols-outlined">open_in_new</span>
        </a>
        <p className="summary-label text-center">SL trạm có nguy cơ<br/><span className="text-sm font-normal text-slate-400">(Đang tải dữ liệu...)</span></p>
      </article>
    );
  }

  const { directCount, indirectCount, totalCount } = data;
  const total = directCount + indirectCount;
  const directEnd = total ? (directCount / total) * 100 : 0;

  const chartStyle = {
    background: total
      ? `conic-gradient(var(--fpt-orange) 0 ${directEnd}%, var(--fpt-green) ${directEnd}% 100%)`
      : "#e2e8f0"
  };

  return (
    <article className="summary-card chart-card" style={ACCENT_STYLE.orange}>
      <a href={SHEET_BASE_URL} target="_blank" rel="noreferrer" className="sheet-link" title="Mở file Google Sheet">
        <span className="material-symbols-outlined">open_in_new</span>
      </a>
      <div className="chart-card-header">
        <div className="summary-icon">
          <span className="material-symbols-outlined text-[20px]">router</span>
        </div>
        <p className="summary-label">SL trạm có nguy cơ</p>
      </div>
      <div className="chart-card-body">
        <div className="pie-wrap">
          <div className="pie-chart" style={chartStyle}></div>
          <p className="pie-total">{totalCount}</p>
        </div>
        <div className="pie-meta">
          <div className="pie-legend">
            <div className="pie-legend-row"><span className="pie-legend-label"><i className="legend-dot dot-orange"></i>Trực tiếp</span><span className="pie-legend-value"><strong>{directCount}</strong></span></div>
            <div className="pie-legend-row"><span className="pie-legend-label"><i className="legend-dot dot-green"></i>Gián tiếp</span><span className="pie-legend-value"><strong>{indirectCount}</strong></span></div>
          </div>
        </div>
      </div>
    </article>
  );
}

function StormImpactTotalCard({ label, value, icon, accentStyle, href }: any) {
  return (
    <article className="summary-card storm-impact-total-card" style={accentStyle}>
      <a href={href} target="_blank" rel="noreferrer" className="sheet-link" title="Mở tab DS tuyến, trạm ảnh hưởng">
        <span className="material-symbols-outlined">open_in_new</span>
      </a>
      <div className="summary-icon"><span className="material-symbols-outlined text-[20px]">{icon}</span></div>
      <div className="min-w-0 flex-1">
        <p className="summary-label">{label}</p>
        <div className="summary-value-row"><p className="summary-value">{value}</p></div>
      </div>
    </article>
  );
}

function SummaryGrid({ data, mode }: any) {
  const visibleDeployments = visibleDashboardDeployments(data.deployments);
  const totalPersonnel = visibleDeployments.reduce((sum: any, item: any) => sum + item.count, 0);
  const deploymentCount = visibleDeployments.length;
  const resources = data.responseResources || { teams: 0, pickupTrucks: 0, measuringDevices: 0, weldingMachines: 0 };
  
  let directRouteCount = 0;
  let directLength = 0;
  let indirectRouteCount = 0;
  let indirectLength = 0;
  let directPopCount = 0;
  let indirectPopCount = 0;
  let totalPopCount = 0;

  if (data?.affectedRoutes) {
    data.affectedRoutes.forEach((route: any) => {
      const type = String(route.impact || "").trim().toLocaleLowerCase("vi-VN");
      const len = parseFloat(route.length) || 0;
      const pop = parseInt(route.pops) || 0;
      if (type) totalPopCount += pop;

      if (type.includes("trực tiếp")) {
        directRouteCount++;
        directLength += len;
        directPopCount += pop;
      } else if (type.includes("gián tiếp")) {
        indirectRouteCount++;
        indirectLength += len;
        indirectPopCount += pop;
      }
    });
  }
  
  const preStormData = {
    directCount: directPopCount,
    indirectCount: indirectPopCount,
    totalPop: totalPopCount
  };
  const preStormRouteData = {
    directCount: directRouteCount,
    directLength,
    indirectCount: indirectRouteCount,
    indirectLength
  };
  
  let stationDirectCount = 0;
  let stationIndirectCount = 0;
  let stationTotalCount = 0;

  if (data?.affectedStations) {
    stationTotalCount = data.affectedStations.length;
    data.affectedStations.forEach((station: any) => {
      const type = (station.impact || "").toLowerCase();
      if (type.includes("trực tiếp")) {
        stationDirectCount++;
      } else if (type.includes("gián tiếp")) {
        stationIndirectCount++;
      }
    });
  }

  const preStormStationData = { directCount: stationDirectCount, indirectCount: stationIndirectCount, totalCount: stationTotalCount };
  const activeStormImpact = summarizeActiveStormImpact({
    affectedRoutes: data.affectedRoutes,
    cableIncidents: data.cableIncidents
  });

  // Check if data is completely empty (initial EmptyData state where arrays are empty)
  const isLoading = data.affectedRoutes.length === 0 && data.deployments.length === 0;

  const SHEET_BASE_URL = `https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_GOOGLE_SHEET_ID || "1fTDLSaxfzLU4XZnPwVhLqIdFNX4-1SdSMpdvyO372nk"}/edit#gid=`;

  return (
    <section className="summary-grid">
      {mode === 'truoc_bao' ? (
        <>
          <PreStormRouteChart data={preStormRouteData} isLoading={isLoading} />
          <PreStormImpactChart data={preStormData} isLoading={isLoading} />
          <PreStormStationChart data={preStormStationData} isLoading={isLoading} />
        </>
      ) : (
        <>
          <IncidentChart type="station" incidents={data.stationIncidents} href={`${SHEET_BASE_URL}2077199790`} />
          <IncidentChart type="cable" incidents={data.cableIncidents} href={`${SHEET_BASE_URL}2025084488`} />
        </>
      )}
      <article className="summary-card" style={ACCENT_STYLE.green}>
        <a href={`${SHEET_BASE_URL}0`} target="_blank" rel="noreferrer" className="sheet-link" title="Mở file Google Sheet">
          <span className="material-symbols-outlined">open_in_new</span>
        </a>
        <div className="summary-icon"><span className="material-symbols-outlined text-[20px]">groups</span></div>
        <div className="min-w-0 flex-1">
          <p className="summary-label">Nhân sự đối tác</p>
          <div className="summary-value-row"><p className="summary-value">{totalPersonnel}</p><span className="chip chip-green">{deploymentCount} điểm đồn trú</span></div>
          <div className="equipment-summary"><span className="material-symbols-outlined">construction</span><span><strong>{deploymentCount}</strong> máy đo</span><span className="equipment-divider">|</span><span><strong>{deploymentCount}</strong> máy hàn</span></div>
        </div>
      </article>
      <article className="summary-card" style={ACCENT_STYLE.blue}>
        <a href={`${SHEET_BASE_URL}0`} target="_blank" rel="noreferrer" className="sheet-link" title="Mở file Google Sheet">
          <span className="material-symbols-outlined">open_in_new</span>
        </a>
        <div className="summary-icon"><span className="material-symbols-outlined text-[20px]">support_agent</span></div>
        <div className="min-w-0 flex-1">
          <p className="summary-label">Nhân sự PMB</p>
          <div className="summary-value-row"><p className="summary-value">{data.operators.length}</p><span className={`chip ${resources.teams ? "chip-blue" : "chip-gray"}`}>{resources.teams} đội ứng cứu</span></div>
          <div className="equipment-summary pmb-equipment"><span className="material-symbols-outlined">local_shipping</span><span>{resources.pickupTrucks} xe bán tải + {resources.measuringDevices} máy đo + {resources.weldingMachines} máy hàn</span></div>
        </div>
      </article>
      {mode === 'trong_bao' && (
        <>
          <StormImpactTotalCard
            label="SL POP bị ảnh hưởng"
            value={activeStormImpact.popCount}
            icon="cell_tower"
            accentStyle={ACCENT_STYLE.purple}
            href={`${SHEET_BASE_URL}763532233`}
          />
          <StormImpactTotalCard
            label="SL KHG FTI bị ảnh hưởng"
            value={activeStormImpact.ftiCustomerCount}
            icon="groups"
            accentStyle={ACCENT_STYLE.teal}
            href={`${SHEET_BASE_URL}763532233`}
          />
        </>
      )}
    </section>
  );
}

function WeatherPanel({ rows, page, setPage, mode, storms, activeStormGeoJSONs, toggleStormGeoJSON, session, onSyncStorms }: any) {
  const current = pageItems(rows, page, PAGE_SIZE.weather);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    await onSyncStorms();
    setIsSyncing(false);
  };

  return (
    <article className="card weather-card" style={ACCENT_STYLE.blue}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <h2 className="card-title" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined">thunderstorm</span>
            {mode === 'truoc_bao' ? 'Thông tin bão' : 'Thời tiết'}
          </h2>
          {mode === 'truoc_bao' && session && (
            <button onClick={handleSync} disabled={isSyncing} className="icon-btn" title="Đồng bộ bão mới nhất" style={{ background: 'transparent', padding: '4px' }}>
              <span className={`material-symbols-outlined ${isSyncing ? 'spin' : ''}`} style={{ fontSize: '20px', color: 'var(--fpt-blue)' }}>sync</span>
            </button>
          )}
        </div>
        {mode === 'trong_bao' && <Pager page={current.page} setPage={setPage} total={rows.length} size={PAGE_SIZE.weather} />}
      </div>
      <div className="table-box">
        {isSyncing ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', minHeight: '250px' }}>
            <style>{`@keyframes spin-sync { 100% { transform: rotate(360deg); } }`}</style>
            <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--fpt-blue)', animation: 'spin-sync 1s linear infinite' }}>sync</span>
            <p style={{ marginTop: '16px', color: '#555', fontWeight: 500 }}>Đang đồng bộ dữ liệu bão từ JTWC...</p>
          </div>
        ) : mode === 'truoc_bao' ? (
          <div className="storm-list" style={{ padding: "0 16px 16px", maxHeight: "400px", overflowY: "auto" }}>
            {(!storms || storms.length === 0) ? (
              <div className="empty-state py-8">Hiện không có bão hoặc áp thấp nhiệt đới trên Biển Đông.</div>
            ) : (
              storms.map((storm: any) => {
                const isActive = !!activeStormGeoJSONs?.[storm.storm_id];
                const meta = storm.metadata;

                return (
                  <div key={storm.storm_id} className="storm-item" style={{ marginBottom: "24px", borderBottom: "1px solid #eee", paddingBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#333", flex: 1, paddingRight: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                        {storm.name || storm.storm_id?.toUpperCase()}
                        {storm.geojson && (
                          <button 
                            title={isActive ? "Tắt bản đồ" : "Bật bản đồ"}
                            onClick={() => toggleStormGeoJSON(storm)}
                            className="icon-btn"
                            style={{ padding: "2px", color: isActive ? "var(--fpt-blue)" : "var(--text-secondary)" }}
                          >
                            <span className="material-symbols-outlined text-[20px]">{isActive ? "visibility" : "visibility_off"}</span>
                          </button>
                        )}
                      </h4>
                    </div>
                    {meta ? (
                      <ul style={{ fontSize: "13px", color: "#555", margin: "0 0 12px 0", lineHeight: "1.6", paddingLeft: "20px" }}>
                        {meta.position && <li><strong>Vị trí:</strong> {meta.position}</li>}
                        {meta.maxSustainedWindsKmH && <li><strong>Sức gió lớn nhất:</strong> {meta.maxSustainedWindsKmH} km/h</li>}
                        {meta.gustsKmH && <li><strong>Gió giật:</strong> {meta.gustsKmH} km/h</li>}
                        {meta.pressureMb && <li><strong>Áp suất tâm bão:</strong> {meta.pressureMb} hPa</li>}
                        {(meta.direction || meta.speedKmH) && <li><strong>Di chuyển:</strong> Hướng {meta.direction || '-'}, tốc độ {meta.speedKmH || '-'} km/h</li>}
                      </ul>
                    ) : (
                      <p style={{ fontSize: "13px", color: "#555", margin: "0 0 12px 0", lineHeight: "1.5" }}>Chưa có thông số chi tiết.</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <table>
            <thead><tr><th className="weather-stt-column">STT</th><th className="weather-area-column">Khu vực</th><th className="weather-condition-column">Thời tiết</th><th className="weather-mobility-column">Di chuyển</th></tr></thead>
            <tbody>
              {!rows.length ? (
                <tr><td colSpan={4}><div className="empty-state">Chưa có dữ liệu trong tab Thời tiết.</div></td></tr>
              ) : current.rows.map((row: any, index: number) => (
                <tr key={`${row.stt}-${current.start + index}`} title={[row.area, row.weather, row.mobility].filter(Boolean).join(" | ")}>
                  <td className="strong weather-stt-column">{String(current.start + index + 1)}</td>
                  <td>{row.area || "-"}</td>
                  <td>{weatherIcon(row.weather)} {row.weather || "-"}</td>
                  <td><StatusChip status={row.mobility || "Chưa cập nhật"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </article>
  );
}

function TasksPanel({ tasks, today, mode }: any) {
  const isPreStorm = mode === 'truoc_bao';
  const visibleTasks = isPreStorm ? tasks : tasksForDate(tasks, today);
  const taskEntries = visibleTasks.map((task: any, index: number) => ({
    task,
    index,
    status: taskStatusMeta(task.status || task.marker)
  }));
  const taskGroups = [
    { key: 'completed', label: 'Hoàn thành', className: 'task-completed', icon: 'check_circle' },
    { key: 'in-progress', label: 'Đang thực hiện', className: 'task-in-progress', icon: 'pending' },
    { key: 'not-started', label: 'Chưa thực hiện', className: 'task-not-started', icon: 'cancel' }
  ].map((group) => ({
    ...group,
    entries: taskEntries.filter((entry: any) => entry.status.className === group.className)
  }));
  return (
    <article className="card tasks-card" style={ACCENT_STYLE.orange}>
      <div className="card-header">
        <div className="task-card-heading">
          <h2 className="card-title">
            <span className="material-symbols-outlined">checklist</span>
            {mode === 'truoc_bao' ? 'Công việc cần làm' : 'Công việc trong ngày'}
          </h2>
          {mode !== 'truoc_bao' && <time className="task-card-date" dateTime={today.split("/").reverse().join("-")}>{today}</time>}
        </div>
      </div>
      <div className="list-box">
        {!visibleTasks.length ? (
          <div className="empty-state">
            {mode === 'truoc_bao' ? 'Chưa có công việc cần làm.' : `Chưa có công việc ngày ${today} trong tab Công việc.`}
          </div>
        ) : (
          <div className="task-status-table">
            {taskGroups.map((group) => (
              <section className={`task-status-group ${group.className}`} key={group.key}>
                <div className="task-status-group-header">
                  <span className="material-symbols-outlined">{group.icon}</span>
                  <h3>{group.label}</h3>
                  <span className="task-status-count">{group.entries.length}</span>
                </div>
                <div className="task-status-group-body">
                  {group.entries.length ? group.entries.map(({ task, index }: any, groupIndex: number) => (
                    <div className="task-status-group-row" key={`${task.id}-${index}`}>
                      <div className="task-copy">
                        <span className="task-content">{numberedTaskName(task.name, groupIndex + 1)}</span>
                        {task.carriedOver && <span className="task-carried-date">Công việc tồn ngày {task.originalDate}</span>}
                        {task.note && <span className="task-note">{task.note}</span>}
                      </div>
                    </div>
                  )) : (
                    <div className="task-status-group-empty">Chưa có công việc</div>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function HiddenIncidentTables({ data, pages, setPages }) {
  const cable = pageItems(data.cableIncidents, pages.cable, PAGE_SIZE.cable);
  const station = pageItems(data.stationIncidents, pages.station, PAGE_SIZE.station);
  return (
    <>
      <article className="card cable-card" style={ACCENT_STYLE.orange}>
        <div className="card-header"><h2 className="card-title"><span className="material-symbols-outlined">cable</span>Hiện trạng tuyến cáp</h2><Pager page={cable.page} setPage={(page) => setPages((old) => ({ ...old, cable: page }))} total={data.cableIncidents.length} size={PAGE_SIZE.cable} /></div>
        <div className="table-box"><table><thead><tr><th>STT</th><th>Ngày</th><th>Mã SC</th><th>Mạch/Trục</th><th>Tuyến</th><th>TG phát sinh</th><th>Vị trí</th><th>Tình trạng</th></tr></thead><tbody>{cable.rows.map((item, index) => <tr key={`${item.code}-${index}`}><td>{item.stt}</td><td>{item.date}</td><td>{item.code}</td><td>{item.circuit}</td><td>{item.target}</td><td>{item.startedAt}</td><td>{item.area}</td><td><StatusChip status={item.status} /></td></tr>)}</tbody></table></div>
      </article>
      <article className="card station-card" style={ACCENT_STYLE.blue}>
        <div className="card-header"><h2 className="card-title"><span className="material-symbols-outlined">home_repair_service</span>Sự cố đài trạm</h2><Pager page={station.page} setPage={(page) => setPages((old) => ({ ...old, station: page }))} total={data.stationIncidents.length} size={PAGE_SIZE.station} /></div>
        <div className="table-box"><table><thead><tr><th>STT</th><th>Mã SC</th><th>Mạch/Trục</th><th>Tuyến/Trạm</th><th>TG phát sinh</th><th>Vị trí</th><th>Tình trạng</th></tr></thead><tbody>{station.rows.map((item, index) => <tr key={`${item.code}-${index}`}><td>{item.stt}</td><td>{item.code}</td><td>{item.circuit}</td><td>{item.target}</td><td>{item.startedAt}</td><td>{item.area}</td><td><StatusChip status={item.status} /></td></tr>)}</tbody></table></div>
      </article>
    </>
  );
}

function GuestIncidentPopup({ menu, edges, incidents, onClose }: any) {
  if (menu.targetType !== 'edge') return null;
  const edge = edges.find((e: any) => e.id == menu.targetId);
  if (!edge || !['incident_external', 'danger_zone', 'resolved'].includes(edge.status)) return null;

  const edgeKey = canonicalRouteKey(edge.name);
  const matchingIncidents = incidents.filter((inc: any) => canonicalRouteKey(inc.target) === edgeKey);
  const incident = matchingIncidents.find((inc: any) => edgeStatusFromIncident(inc.status) === edge.status)
    || matchingIncidents[0];

  const isNearBottom = menu.y > (window.innerHeight - 250) || menu.y > 360;
  const style: React.CSSProperties = {
    position: 'absolute',
    left: menu.x,
    top: isNearBottom ? menu.y - 16 : menu.y + 16,
    transform: isNearBottom ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
    background: 'white',
    padding: '12px 16px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 1000,
    minWidth: '220px',
    fontSize: '13px',
    color: '#333'
  };

  if (!incident) {
    return (
      <div style={style} className="guest-incident-popup">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
          <strong style={{ fontSize: '14px', color: '#1a1a1a' }}>{edge.name}</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#888', padding: '0 4px', fontSize: '16px' }}>✕</button>
        </div>
        <div style={{ color: 'red' }}>Đang lấy dữ liệu hoặc không tìm thấy dữ liệu sự cố cho tuyến này trong sheet.</div>
      </div>
    );
  }

  const isResolved = edge.status === 'resolved';

  return (
    <div style={style} className="guest-incident-popup">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
        <strong style={{ fontSize: '14px', color: '#1a1a1a' }}>{edge.name}</strong>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#888', padding: '0 4px', fontSize: '16px' }}>✕</button>
      </div>

      <div style={{ marginBottom: '4px' }}>
        <span style={{ color: '#666' }}>Số vị trí sự cố:</span> <b style={{ marginLeft: '4px' }}>{incident.incidentCount || '-'}</b>
      </div>
      <div style={{ marginBottom: '4px' }}>
        <span style={{ color: '#666' }}>Vị trí:</span> 
        <b style={{ marginLeft: '4px', whiteSpace: 'pre-line' }}>{incident.location || '-'}</b>
      </div>

      {isResolved && (
        <div>
          <span style={{ color: '#666' }}>Tổng thời gian xử lý:</span> <b style={{ marginLeft: '4px' }}>{incident.processingTime || '-'}</b>
        </div>
      )}
    </div>
  );
}

function sumTimes(times: string[]) {
  let totalMinutes = 0;
  times.forEach((t) => {
    if (!t) return;
    const parts = t.split(':');
    if (parts.length >= 2) {
      totalMinutes += parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    } else {
      const val = parseFloat(t);
      if (!isNaN(val)) totalMinutes += val * 60;
    }
  });
  if (totalMinutes === 0) return "-";
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:00`;
}

function GuestNodePopup({ menu, nodes, incidents, onClose }: any) {
  if (menu.targetType !== 'node') return null;
  const node = nodes.find((n: any) => n.id == menu.targetId);
  if (!node) return null;

  const isNearBottom = menu.y > (window.innerHeight - 250) || menu.y > 360;
  const style: React.CSSProperties = {
    position: 'absolute',
    left: menu.x,
    top: isNearBottom ? menu.y - 16 : menu.y + 16,
    transform: isNearBottom ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
    background: 'rgba(6, 10, 20, 0.94)',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(0, 102, 255, 0.35)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
    zIndex: 1000,
    minWidth: '240px',
    maxWidth: '320px',
    fontSize: '13px',
    color: '#ffffff'
  };

  const nodeKey = stationKey(node.name);
  const stationIncidents = incidents.filter((inc: any) => stationKey(inc.target) === nodeKey);
  const causes = Array.from(new Set(stationIncidents.map((inc: any) => inc.cause).filter(Boolean)));
  const times = stationIncidents.map((inc: any) => inc.processingTime).filter(Boolean);
  const acBackup = stationIncidents.find((inc: any) => inc.acBackup)?.acBackup || '-';

  return (
    <div style={style} className="guest-incident-popup guest-node-popup">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '9px', borderBottom: '1px solid rgba(148, 163, 184, 0.22)', paddingBottom: '7px' }}>
        <strong style={{ fontSize: '14px', color: '#ffffff' }}>Trạm {node.name}</strong>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '0 4px', fontSize: '16px' }}>✕</button>
      </div>

      {!stationIncidents.length ? (
        <div style={{ color: '#94a3b8', lineHeight: 1.45 }}>Chưa có dữ liệu sự cố của trạm này trên Google Sheet.</div>
      ) : (
        <>
          <div style={{ marginBottom: '5px' }}>
            <span style={{ color: '#94a3b8' }}>Số lượng sự cố:</span> <b style={{ marginLeft: '4px', color: '#ffffff' }}>{stationIncidents.length}</b>
          </div>
          <div style={{ marginBottom: '5px' }}>
            <span style={{ color: '#94a3b8' }}>Nguyên nhân:</span>
            <b style={{ marginLeft: '4px', color: '#ffffff' }}>{causes.length > 0 ? causes.join(', ') : '-'}</b>
          </div>
          <div style={{ marginBottom: '5px' }}>
            <span style={{ color: '#94a3b8' }}>Tổng TG xử lý:</span> <b style={{ marginLeft: '4px', color: '#ffffff' }}>{sumTimes(times)}</b>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>Năng lực backup:</span> <b style={{ marginLeft: '4px', color: '#ffffff' }}>{acBackup}</b>
          </div>
        </>
      )}
    </div>
  );
}

function GuestTeamPopup({ menu, teams, deployments, onClose }: any) {
  if (menu.targetType !== 'team') return null;
  const team = teams.find((t: any) => t.id === menu.targetId);
  if (!team || (team.type !== 'FFC' && team.type !== 'DCV')) return null;

  const donTru = String(team.don_tru || team.donTru || '').trim();
  const donTruClean = donTru.toLowerCase();
  const teamTypeClean = String(team.type || '').toUpperCase().trim();

  const matchPartner = (type: string, partner: string) => {
    const p = String(partner || '').toUpperCase().trim();
    if (type === 'DCV' && (p.includes('DCV') || p.includes('ĐCV'))) return true;
    if (type === 'FFC' && p.includes('FFC')) return true;
    return type === p;
  };

  const deployment = deployments.find((d: any) => {
    const loc = String(d.location || '').trim().toLowerCase();
    return loc && donTruClean && loc === donTruClean && matchPartner(teamTypeClean, d.partner);
  }) || deployments.find((d: any) => {
    const loc = String(d.location || '').trim().toLowerCase();
    return loc && donTruClean && loc === donTruClean && Boolean(String(d.leader || '').trim());
  });

  const leader = String(deployment?.leader || '').trim();
  if (!leader) return null;

  const isNearBottom = menu.y > (window.innerHeight - 250) || menu.y > 360;
  const style: React.CSSProperties = {
    position: 'absolute',
    left: menu.x,
    top: isNearBottom ? menu.y - 16 : menu.y + 16,
    transform: isNearBottom ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
    background: 'rgba(6, 10, 20, 0.94)',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(0, 102, 255, 0.35)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
    zIndex: 1000,
    minWidth: '240px',
    maxWidth: '320px',
    fontSize: '13px',
    color: '#ffffff'
  };

  return (
    <div style={style} className="guest-incident-popup guest-team-popup">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '9px', borderBottom: '1px solid rgba(148, 163, 184, 0.22)', paddingBottom: '7px' }}>
        <strong style={{ fontSize: '14px', color: '#ffffff' }}>{team.name || `Đội ${team.type}`}</strong>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '0 4px', fontSize: '16px' }}>✕</button>
      </div>

      <div style={{ marginBottom: '5px' }}>
        <span style={{ color: '#94a3b8' }}>Đồn trú:</span> <b style={{ marginLeft: '4px', color: '#ffffff' }}>{donTru || '-'}</b>
      </div>
      <div style={{ marginBottom: '5px' }}>
        <span style={{ color: '#94a3b8' }}>Đối tác:</span> <b style={{ marginLeft: '4px', color: '#ffffff' }}>{deployment?.partner || team.type}</b>
      </div>
      <div style={{ marginBottom: '5px' }}>
        <span style={{ color: '#94a3b8' }}>SL nhân sự tại đồn trú:</span> <b style={{ marginLeft: '4px', color: '#ffffff' }}>{deployment?.count ?? '-'}</b>
      </div>
      <div>
        <span style={{ color: '#94a3b8' }}>Đội trưởng:</span> <b style={{ marginLeft: '4px', color: '#ffffff' }}>{leader}</b>
      </div>
    </div>
  );
}

function EmptyData() {
  return {
    cableIncidents: [], stationIncidents: [], incidents: [], affectedStations: [], affectedRoutes: [], stormImpactSummary: { popCount: 0, ftiCustomerCount: 0 }, routeInformation: [], deployments: [], operators: [], responseResources: { teams: 0, pickupTrucks: 0, measuringDevices: 0, weldingMachines: 0 }, weatherRows: [], preStormTasks: [], inStormTasks: [], tasks: []
  };
}

export default function App() {
  const reportRef = useRef(null);
  const [captureMode, setCaptureMode] = useState(new URLSearchParams(window.location.search).get("capture") === "1");
  const [data, setData] = useState(EmptyData);
  const [lastUpdated, setLastUpdated] = useState("Đang tải dữ liệu Google Sheet...");
  const [pages, setPages] = useState({ cable: 0, station: 0, weather: 0, tasks: 0 });
  const [capturing, setCapturing] = useState(false);
  const [today, setToday] = useState(vietnamDateKey);
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>('trong_bao');
  const [storms, setStorms] = useState<any[]>([]);
  const [activeStormGeoJSONs, setActiveStormGeoJSONs] = useState<Record<string, any>>({});

  const toggleStormGeoJSON = useCallback((storm: any) => {
    setActiveStormGeoJSONs(prev => {
      const next = { ...prev };
      if (next[storm.storm_id]) {
        delete next[storm.storm_id];
      } else {
        next[storm.storm_id] = storm.geojson;
      }
      return next;
    });
  }, []);

  const fetchStorms = useCallback(async () => {
    try {
      const res = await fetch("/api/storms");
      const json = await res.json();
      if (json.success) setStorms(json.data);
    } catch (e) {
      console.error("Error fetching storms", e);
    }
  }, []);

  useEffect(() => {
    fetchStorms();
  }, [fetchStorms]);

  const handleSyncStorms = useCallback(async () => {
    try {
      const res = await fetch("/api/jtwc-sync", { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        alert("Đã cập nhật bão thành công!");
        fetchStorms();
      } else {
        alert("Lỗi đồng bộ: " + json.message);
      }
    } catch (e) {
      alert("Lỗi kết nối khi đồng bộ bão.");
    }
  }, [fetchStorms]);

  // --- Map State ---
  const [mapState, mapDispatch] = useReducer(mapReducer, EMPTY_MAP_STATE);
  const incidentMapState = useMemo(() => deriveIncidentMapFeatures({
    mode: dashboardMode,
    edges: mapState.edges,
    nodes: mapState.nodes,
    cableIncidents: data.cableIncidents,
    stationIncidents: data.stationIncidents,
    affectedRoutes: data.affectedRoutes
  }), [dashboardMode, mapState.edges, mapState.nodes, data.cableIncidents, data.stationIncidents, data.affectedRoutes]);
  const mapInstanceRef = useRef<vietmapgl.Map | null>(null);
  const pendingTeamIdRef = useRef<string | null>(null);

  // --- Auth State ---
  const [session, setSession] = useState<any>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setLoginError(error.message);
    else setShowLogin(false);
  };

  useEffect(() => {
    async function loadInitialMapData() {
      try {
        const res = await fetch('/Master_Road_Network.geojson');
        const raw = await res.json();
        const { nodes, edges } = parseGeoJSON(raw);

        // Fetch db states
        const [nodesRes, edgesRes, teamsRes] = await Promise.all([
          supabase.from('nodes_status').select('*'),
          supabase.from('edges_status').select('*'),
          supabase.from('teams').select('*')
        ]);

        const dbNodes = nodesRes.data || [];
        const dbEdges = edgesRes.data || [];
        const dbTeams = teamsRes.data || [];

        // Merge state
        const nodeMap = new Map(dbNodes.map(n => [n.id, n.status]));
        const edgeMap = new Map(dbEdges.map(e => [e.id, { status: e.status, statusBeforeTyphoon: e.statusbeforetyphoon || e.statusBeforeTyphoon }]));

        nodes.forEach(n => { if (nodeMap.has(n.id)) n.status = nodeMap.get(n.id); });
        edges.forEach(e => {
          if (edgeMap.has(e.id)) {
            const mapped = edgeMap.get(e.id)!;
            e.status = mapped.status;
            if (mapped.statusBeforeTyphoon) e.statusBeforeTyphoon = mapped.statusBeforeTyphoon;
          }
        });

        mapDispatch({ type: 'INIT_DATA', nodes, edges });
        dbTeams.forEach(t => {
          if (t.label_offset) t.labelOffset = t.label_offset;
          mapDispatch({ type: 'ADD_TEAM', team: t });
        });

      } catch (err) {
        console.error('Failed to load map data:', err);
      }
    }
    loadInitialMapData();

    // Subscribe to realtime
    const channel = supabase.channel('map-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nodes_status' }, (payload) => {
        if (payload.new && payload.new.id) mapDispatch({ type: 'SET_NODE_STATUS', id: payload.new.id, status: payload.new.status });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'edges_status' }, (payload) => {
        if (payload.new && payload.new.id) {
          mapDispatch({ 
            type: 'SET_EDGE_STATUS', 
            id: payload.new.id, 
            status: payload.new.status,
            statusBeforeTyphoon: payload.new.statusbeforetyphoon || payload.new.statusBeforeTyphoon 
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          mapDispatch({ type: 'REMOVE_TEAM', id: payload.old.id });
        } else if (payload.new) {
          const t = payload.new as any;
          if (t.label_offset) t.labelOffset = t.label_offset;
          mapDispatch({ type: 'ADD_TEAM', team: t });
          mapDispatch({ type: 'UPDATE_TEAM', id: t.id, patch: t });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleNodeStatus = useCallback(async (id: string, status: string) => {
    if (!session) return;
    mapDispatch({ type: 'SET_NODE_STATUS', id, status }); // Optimistic local
    await supabase.from('nodes_status').upsert({ id, status });
  }, [session]);

  const handleEdgeStatus = useCallback(async (id: string, status: string) => {
    if (!session) return;
    if (dashboardMode === 'truoc_bao') {
      mapDispatch({ type: 'SET_EDGE_STATUS', id, statusBeforeTyphoon: status as EdgeStatus }); // Optimistic local
      await supabase.from('edges_status').update({ statusbeforetyphoon: status }).eq('id', id);
    } else {
      mapDispatch({ type: 'SET_EDGE_STATUS', id, status: status as EdgeStatus }); // Optimistic local
      await supabase.from('edges_status').update({ status }).eq('id', id);
    }
  }, [session, dashboardMode]);

  const handleAddTeam = useCallback(async () => {
    if (!mapInstanceRef.current || !session) return;
    const center = mapInstanceRef.current.getCenter();
    const newTeam = {
      id: `team_${Date.now()}`,
      name: '',
      type: 'FPT',
      position: [center.lng, center.lat],
    };
    pendingTeamIdRef.current = newTeam.id;
    mapDispatch({ type: 'ADD_TEAM', team: newTeam as any });
    await supabase.from('teams').insert(newTeam);
  }, [session]);

  const handleTeamDrop = useCallback(async (teamId: string, lngLat: [number, number]) => {
    if (!session) return;
    const SNAP_RADIUS_KM = 2;
    let nearest = null;
    let minDist = Infinity;
    for (const node of incidentMapState.nodes) {
      if (node.status === 'isolated' || node.status === 'power_out') {
        const d = haversine(lngLat, node.coordinates);
        if (d < minDist && d <= SNAP_RADIUS_KM) {
          minDist = d;
          nearest = node;
        }
      }
    }
    const finalPosition = nearest ? nearest.coordinates : lngLat;
    mapDispatch({ type: 'UPDATE_TEAM', id: teamId, patch: { position: finalPosition } });
    await supabase.from('teams').update({ position: finalPosition }).eq('id', teamId);
  }, [incidentMapState.nodes, session]);

  const handleTeamNameChange = useCallback(async (teamId: string, name: string) => {
    mapDispatch({ type: 'UPDATE_TEAM', id: teamId, patch: { name } });
    if (session) await supabase.from('teams').update({ name }).eq('id', teamId);
  }, [session]);

  const handleTeamNoteChange = useCallback(async (teamId: string, note: string) => {
    mapDispatch({ type: 'UPDATE_TEAM', id: teamId, patch: { note } });
    if (session) await supabase.from('teams').update({ note }).eq('id', teamId);
  }, [session]);

  const handleTeamDonTruChange = useCallback(async (teamId: string, don_tru: string) => {
    mapDispatch({ type: 'UPDATE_TEAM', id: teamId, patch: { don_tru } });
    if (session) await supabase.from('teams').update({ don_tru }).eq('id', teamId);
  }, [session]);

  const handleTeamTypeChange = useCallback(async (teamId: string, type: string) => {
    mapDispatch({ type: 'UPDATE_TEAM', id: teamId, patch: { type: type as TeamType } });
    if (session) await supabase.from('teams').update({ type }).eq('id', teamId);
  }, [session]);

  const handleTeamLabelDrop = useCallback(async (teamId: string, dx: number, dy: number) => {
    mapDispatch({ type: 'UPDATE_TEAM', id: teamId, patch: { labelOffset: { dx, dy } } });
    if (session) await supabase.from('teams').update({ label_offset: { dx, dy } }).eq('id', teamId);
  }, [session]);

  const handleConfirmTeam = useCallback((teamId: string) => {
    if (pendingTeamIdRef.current === teamId) {
      pendingTeamIdRef.current = null;
    }
  }, []);

  const handleRemoveTeam = useCallback(async (id: string) => {
    if (!session) return;
    mapDispatch({ type: 'REMOVE_TEAM', id });
    if (pendingTeamIdRef.current === id) pendingTeamIdRef.current = null;
    await supabase.from('teams').delete().eq('id', id);
  }, [session]);

  const contextNodeStatus = mapState.contextMenu?.targetType === 'node'
    ? incidentMapState.nodes.find((n) => n.id === mapState.contextMenu?.targetId)?.status
    : undefined;
  const contextEdgeStatus = mapState.contextMenu?.targetType === 'edge'
    ? incidentMapState.edges.find((e) => e.id === mapState.contextMenu?.targetId)?.status
    : undefined;

  const pendingTeam = pendingTeamIdRef.current
    ? mapState.teams.find((t) => t.id === pendingTeamIdRef.current) ?? null
    : null;

  const loadDashboard = useCallback(async ({ resetPages = true, showLoading = true } = {}) => {
    if (showLoading) setLastUpdated("Đang tải dữ liệu Google Sheet...");
    try {
      const nextData = await loadDashboardData();
      setData(nextData);
      if (resetPages) setPages({ cable: 0, station: 0, weather: 0, tasks: 0 });
      const timestamp = new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit", minute: "2-digit", second: "2-digit", day: "2-digit", month: "2-digit", year: "numeric"
      }).format(new Date());
      setLastUpdated(`Cập nhật từ Google Sheet: ${timestamp}`);
    } catch (error) {
      console.error(error);
      setLastUpdated(`Không tải được Google Sheet: ${error.message}`);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadDashboard({ resetPages: false, showLoading: false });
      }
    }, DASHBOARD_AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextDate = vietnamDateKey();
      setToday((currentDate) => currentDate === nextDate ? currentDate : nextDate);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadedDateRef = useRef(today);
  useEffect(() => {
    if (loadedDateRef.current === today) return;
    loadedDateRef.current = today;
    loadDashboard();
  }, [today, loadDashboard]);

  const captureReport = async () => {
    if (!mapInstanceRef.current) {
      alert("Bản đồ chưa sẵn sàng!");
      return;
    }
    setCapturing(true);
    setCaptureMode(true);
    try {
      // Nhận diện thiết bị iOS (iPhone / iPad)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      // Khống chế pixelRatio trên di động iOS <= 2.0 để tránh tràn trần 16 Megapixels của Safari
      const pixelRatio = isIOS
        ? Math.min(window.devicePixelRatio || 1.5, 2.0)
        : (window.devicePixelRatio || 1.5);

      // 1. Lấy trực tiếp HTMLCanvasElement từ exportMapImage (Canvas-to-Canvas 0-copy)
      const mapCanvas = (await exportMapImage({
        map: mapInstanceRef.current,
        operatorName: mapState.operatorName,
        edges: incidentMapState.edges,
        nodes: incidentMapState.nodes,
        teams: mapState.teams,
        showTeamNames: mapState.showTeamNames,
        mode: dashboardMode,
        returnCanvas: true,
      })) as HTMLCanvasElement;

      // 2. Chờ font load xong (Inter, Material Symbols)
      await document.fonts.ready;
      await new Promise(res => setTimeout(res, 200));

      const dashboardElement = document.querySelector('.dashboard-shell') as HTMLElement;
      const imageSlot = document.querySelector('.image-slot') as HTMLElement;
      if (!dashboardElement || !imageSlot) throw new Error("Không tìm thấy giao diện báo cáo");

      // Lưu lại style cũ và ép kích thước Desktop nếu màn hình đang hẹp hoặc lùn
      const originalWidth = dashboardElement.style.width;
      const originalHeight = dashboardElement.style.height;
      const originalTransform = dashboardElement.style.transform;
      const originalOverflow = dashboardElement.style.overflow;

      if (dashboardElement.offsetWidth < 1366 || dashboardElement.offsetHeight < 768) {
        dashboardElement.style.width = '1366px';
        dashboardElement.style.height = 'auto';
        dashboardElement.style.overflow = 'visible';
        dashboardElement.style.transform = 'none';
        await new Promise(res => setTimeout(res, 200)); // Chờ layout cập nhật
      }

      // 3. Tính toán vị trí tương quan của khung chứa map (.image-slot) so với .dashboard-shell
      const dashRect = dashboardElement.getBoundingClientRect();
      const slotRect = imageSlot.getBoundingClientRect();

      const relLeft = slotRect.left - dashRect.left;
      const relTop = slotRect.top - dashRect.top;
      const relW = slotRect.width;
      const relH = slotRect.height;

      // 4. Chụp toàn bộ dashboard thành 2D Canvas bằng html-to-image
      const dashboardCanvas = await htmlToImage.toCanvas(dashboardElement, {
        backgroundColor: '#f3f7fb',
        pixelRatio,
      });

      // Trả lại kích thước ban đầu cho DOM
      dashboardElement.style.width = originalWidth;
      dashboardElement.style.height = originalHeight;
      dashboardElement.style.transform = originalTransform;
      dashboardElement.style.overflow = originalOverflow;

      // 5. Vẽ đè mapCanvas trực tiếp lên dashboardCanvas bằng Canvas 2D Context (Hoàn toàn đồng bộ & tiết kiệm RAM)
      const ctx = dashboardCanvas.getContext('2d');
      if (ctx && mapCanvas) {
        ctx.drawImage(
          mapCanvas,
          relLeft * pixelRatio,
          relTop * pixelRatio,
          relW * pixelRatio,
          relH * pixelRatio
        );
      }

      // 6. Chuyển đổi sang Blob và phân nhánh tải file theo OS (iOS Share Sheet vs PC 1-Click)
      const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
      const filename = `bao-cao-bao-noc-${timestamp}.png`;

      await new Promise<void>((resolve, reject) => {
        dashboardCanvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error("Tạo dữ liệu ảnh thất bại"));
            return;
          }

          try {
            // Ưu tiên Web Share API trên iOS (iPhone/iPad)
            if (isIOS && navigator.share) {
              const file = new File([blob], filename, { type: 'image/png' });
              if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'Báo cáo tác chiến NOC' });
                resolve();
                return;
              }
            }

            // PC / Android / Fallback: Tạo Blob URL
            const blobUrl = URL.createObjectURL(blob);

            if (isIOS) {
              // iOS Fallback: Mở tab mới với Blob URL để người dùng chạm giữ "Lưu vào Ảnh"
              const newWindow = window.open(blobUrl, '_blank');
              if (!newWindow) {
                alert("Vui lòng cho phép 'Cửa sổ bật lên' (Pop-up) trên Safari để xem và lưu ảnh.");
              }
            } else {
              // PC / Android: Tự động tải file 1-Click
              const link = document.createElement("a");
              link.download = filename;
              link.href = blobUrl;
              document.body.appendChild(link);
              link.click();
              link.remove();
            }

            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
            resolve();
          } catch (err) {
            reject(err);
          }
        }, 'image/png');
      });
    } catch (error: any) {
      console.error(error);
      alert(`Chưa chụp được báo cáo: ${error.message}`);
    } finally {
      setCaptureMode(false);
      setCapturing(false);
    }
  };


  return (
    <main id="report-page" className={`dashboard-shell dashboard-mode-${dashboardMode}`} ref={reportRef}>
      {captureMode && (
        <style>{`
          .storm-list::-webkit-scrollbar, .list-box::-webkit-scrollbar {
            display: none !important;
          }
          .storm-list, .list-box {
            -ms-overflow-style: none !important;
            scrollbar-width: none !important;
          }
        `}</style>
      )}
      <header className="topbar">
        <div className="flex items-center gap-3 min-w-0">
          <div className="brand-logo-frame"><img src="/fpt-telecom-logo.svg" alt="FPT Telecom" /></div>
          <h1 
            className="truncate cursor-pointer hover:text-[var(--fpt-blue)] flex items-center gap-2 transition-colors"
            onClick={() => setDashboardMode(prev => prev === 'trong_bao' ? 'truoc_bao' : 'trong_bao')}
            title="Nhấn để chuyển đổi chế độ Trước Bão / Trong Bão"
          >
            {dashboardMode === 'trong_bao' ? 'Dashboard báo cáo bão PMB' : 'Công tác chuẩn bị trước bão PMB'}
            <span className="material-symbols-outlined text-[20px]">swap_horiz</span>
          </h1>
          <a href={`https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_GOOGLE_SHEET_ID || "1fTDLSaxfzLU4XZnPwVhLqIdFNX4-1SdSMpdvyO372nk"}/edit`} target="_blank" rel="noreferrer" title="Mở file Google Sheet" className="text-slate-400 hover:text-[var(--fpt-blue)] transition-colors flex items-center text-sm underline ml-1">
            Xem chi tiết
          </a>
        </div>
        {!captureMode && <div className="flex items-center gap-2 no-capture">
          <div className="update-badge"><span className="material-symbols-outlined text-[15px]">update</span><span>{lastUpdated}</span></div>
          <button className="capture-button" title="Chụp dashboard thành ảnh PNG" onClick={captureReport} disabled={capturing}>
            <span className="material-symbols-outlined text-[17px]">{capturing ? "hourglass_top" : "photo_camera"}</span><span>{capturing ? "Đang chụp..." : "Chụp"}</span>
          </button>
          <button className="icon-btn" title="Tải lại dữ liệu" onClick={() => loadDashboard()}><span className="material-symbols-outlined text-[18px]">refresh</span></button>

          {/* Nút Đăng nhập/Đăng xuất */}
          <div style={{ position: 'relative' }}>
            {session ? (
              <button className="icon-btn" title="Đăng xuất" onClick={() => supabase.auth.signOut()} style={{ background: 'var(--fpt-green)', color: '#fff' }}>
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            ) : (
              <button className="icon-btn" title="Đăng nhập Admin" onClick={() => setShowLogin(!showLogin)}>
                <span className="material-symbols-outlined text-[18px]">lock</span>
              </button>
            )}

            {/* Modal Đăng nhập */}
            {showLogin && !session && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', padding: '16px', background: '#fff', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, width: '260px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 800 }}>Đăng nhập Admin</h3>
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }} required />
                  <input type="password" placeholder="Mật khẩu" value={password} onChange={e => setPassword(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }} required />
                  {loginError && <div style={{ color: 'red', fontSize: '11px' }}>{loginError}</div>}
                  <button type="submit" className="btn btn-primary" style={{ padding: '8px', background: 'var(--fpt-blue)', color: '#fff', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Đăng nhập</button>
                </form>
              </div>
            )}
          </div>
        </div>}
      </header>

      <div className="dashboard-body">
        <SummaryGrid data={data} mode={dashboardMode} />
        <WeatherPanel 
          rows={data.weatherRows} 
          page={pages.weather} 
          setPage={(p: number) => setPages(pgs => ({...pgs, weather: p}))} 
          mode={dashboardMode}
          storms={storms}
          activeStormGeoJSONs={activeStormGeoJSONs}
          toggleStormGeoJSON={toggleStormGeoJSON}
          session={session}
          onSyncStorms={handleSyncStorms}
        />
        <section className="content-grid">
          <HiddenIncidentTables data={data} pages={pages} setPages={setPages} />
          <TasksPanel
            tasks={dashboardMode === 'truoc_bao' ? data.preStormTasks : data.inStormTasks}
            page={pages.tasks}
            setPage={(page: number) => setPages((old) => ({ ...old, tasks: page }))}
            today={today}
            mode={dashboardMode}
          />
          <article className="card rescue-card" style={ACCENT_STYLE.green}>
            <div className="card-header">
              <h2 className="card-title"><span className="material-symbols-outlined">map</span>Thông tin đội ứng cứu khắc phục sự cố</h2>
              <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
                {(!capturing && !captureMode) && (
                  <>
                    <button className="capture-button" onClick={() => {
                      if (mapInstanceRef.current) {
                        exportMapImage({
                          map: mapInstanceRef.current,
                          operatorName: mapState.operatorName,
                          edges: incidentMapState.edges,
                          nodes: incidentMapState.nodes,
                          teams: mapState.teams,
                          showTeamNames: mapState.showTeamNames,
                          mode: dashboardMode,
                        });
                      }
                    }} style={{ padding: "4px 8px", background: "var(--color-warning)" }}>
                      <span className="material-symbols-outlined text-[15px]">photo_camera</span> Export
                    </button>
                    {session && (
                      <button className="capture-button" onClick={handleAddTeam} style={{ padding: "4px 8px", background: "var(--fpt-green)" }}>
                        <span className="material-symbols-outlined text-[15px]">add</span> Thêm đội
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="image-slot" style={{ padding: 0 }}>
              <MapCanvas
                edges={incidentMapState.edges}
                nodes={incidentMapState.nodes}
                teams={mapState.teams}
                routeInformation={data.routeInformation}
                sidebarCollapsed={false}
                showTeamNames={mapState.showTeamNames}
                mode={dashboardMode}
                isLoggedIn={Boolean(session)}
                activeStormGeoJSONs={activeStormGeoJSONs}
                onToggleTeamNames={() => mapDispatch({ type: 'TOGGLE_TEAM_NAMES' })}
                onContextMenu={(menu) => mapDispatch({ type: 'OPEN_CONTEXT', menu })}
                onCloseContextMenu={() => mapDispatch({ type: 'CLOSE_CONTEXT' })}
                onTeamDrop={handleTeamDrop}
                onMapReady={(map) => { mapInstanceRef.current = map; }}
                pendingTeam={pendingTeam}
                onTeamNameChange={handleTeamNameChange}
                onTeamNoteChange={handleTeamNoteChange}
                onTeamDonTruChange={handleTeamDonTruChange}
                onTeamTypeChange={handleTeamTypeChange}
                onTeamLabelDrop={handleTeamLabelDrop}
                onConfirmTeam={handleConfirmTeam}
                onRemoveTeam={handleRemoveTeam}
              />
              {mapState.contextMenu?.visible && (
                <>
                  {session && dashboardMode === 'truoc_bao' && (
                    <ContextMenu
                      menu={mapState.contextMenu}
                      currentNodeStatus={contextNodeStatus}
                      currentEdgeStatus={contextEdgeStatus}
                      onNodeStatusChange={handleNodeStatus}
                      onEdgeStatusChange={handleEdgeStatus}
                      onClose={() => mapDispatch({ type: 'CLOSE_CONTEXT' })}
                      mode={dashboardMode}
                    />
                  )}
                  {(!session || dashboardMode === 'trong_bao') && (
                    <>
                      <GuestIncidentPopup
                        menu={mapState.contextMenu}
                        edges={incidentMapState.edges}
                        incidents={data.cableIncidents}
                        onClose={() => mapDispatch({ type: 'CLOSE_CONTEXT' })}
                      />
                      <GuestNodePopup
                        menu={mapState.contextMenu}
                        nodes={incidentMapState.nodes}
                        incidents={data.stationIncidents}
                        onClose={() => mapDispatch({ type: 'CLOSE_CONTEXT' })}
                      />
                    </>
                  )}
                  <GuestTeamPopup
                    menu={mapState.contextMenu}
                    teams={mapState.teams}
                    deployments={data.deployments}
                    onClose={() => mapDispatch({ type: 'CLOSE_CONTEXT' })}
                  />
                </>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
