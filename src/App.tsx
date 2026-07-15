import { useCallback, useEffect, useRef, useState, useReducer } from "react";
import maplibregl from "maplibre-gl";
import * as htmlToImage from "html-to-image";
import { loadDashboardData } from "./dashboardData";
import { MapCanvas } from "./components/MapCanvas";
import { ContextMenu } from "./components/ContextMenu";
import { parseGeoJSON } from "./data/geojsonParser";
import { mapReducer, EMPTY_MAP_STATE, haversine } from "./mapState";
import { exportMapImage } from "./utils/exportMap";
import { supabase } from "./lib/supabase";
import type { NodeStatus, EdgeStatus, Team, TeamType } from "./types";

const PAGE_SIZE = {
  cable: 4,
  station: 3,
  weather: 99,
  tasks: 6
};

const ACCENT_STYLE = {
  blue: { "--accent": "var(--fpt-blue)", "--accent-rgb": "0, 91, 172" },
  orange: { "--accent": "var(--fpt-orange)", "--accent-rgb": "244, 124, 32" },
  green: { "--accent": "var(--fpt-green)", "--accent-rgb": "109, 179, 63" }
};

function chipClass(status) {
  const lower = String(status || "").toLowerCase();
  if (lower.includes("hoàn thành") || lower.includes("an toàn") || lower.includes("bình thường") || lower.includes("ổn định")) return "chip-green";
  if (lower.includes("đang xử lý") || lower.includes("mưa") || lower.includes("ảnh hưởng gián tiếp") || lower.includes("theo dõi")) return "chip-orange";
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

function IncidentChart({ type, total, open, href }) {
  const done = Math.max(total - open, 0);
  const openPercent = total ? (open / total) * 100 : 0;
  const isStation = type === "station";
  const accentStyle = isStation ? ACCENT_STYLE.blue : ACCENT_STYLE.orange;
  const chartStyle = {
    background: total
      ? `conic-gradient(var(--fpt-orange) 0 ${openPercent}%, var(--fpt-green) ${openPercent}% 100%)`
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
          <p className="pie-total">{total}</p>
        </div>
        <div className="pie-meta">
          <div className="pie-legend">
            <div className="pie-legend-row"><span className="pie-legend-label"><i className="legend-dot dot-orange"></i>Đang xử lý</span><span className="pie-legend-value">{open}</span></div>
            <div className="pie-legend-row"><span className="pie-legend-label"><i className="legend-dot dot-green"></i>Hoàn thành</span><span className="pie-legend-value">{done}</span></div>
          </div>
        </div>
      </div>
    </article>
  );
}

function SummaryGrid({ data }) {
  const activeCable = data.cableIncidents.filter((item) => !String(item.status || "").toLowerCase().includes("hoàn thành"));
  const stationOpen = data.stationIncidents.filter((item) => !String(item.status || "").toLowerCase().includes("hoàn thành"));
  const totalPersonnel = data.deployments.reduce((sum, item) => sum + item.count, 0);
  const deploymentCount = data.deployments.length;

  const SHEET_BASE_URL = `https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_GOOGLE_SHEET_ID || "1fTDLSaxfzLU4XZnPwVhLqIdFNX4-1SdSMpdvyO372nk"}/edit#gid=`;

  return (
    <section className="summary-grid">
      <IncidentChart type="station" total={data.stationIncidents.length} open={stationOpen.length} href={`${SHEET_BASE_URL}2077199790`} />
      <IncidentChart type="cable" total={data.cableIncidents.length} open={activeCable.length} href={`${SHEET_BASE_URL}2025084488`} />
      <article className="summary-card" style={ACCENT_STYLE.green}>
        <a href={`${SHEET_BASE_URL}0`} target="_blank" rel="noreferrer" className="sheet-link" title="Mở file Google Sheet">
          <span className="material-symbols-outlined">open_in_new</span>
        </a>
        <div className="summary-icon"><span className="material-symbols-outlined text-[20px]">groups</span></div>
        <div className="min-w-0 flex-1">
          <p className="summary-label">Nhân sự đối tác</p>
          <div className="summary-value-row"><p className="summary-value">{totalPersonnel}</p><span className="chip chip-green">{deploymentCount} điểm đồn trú</span></div>
          <div className="equipment-summary"><span className="material-symbols-outlined">construction</span><span><strong>{deploymentCount}</strong> máy đo</span><span className="equipment-divider">|</span><span><strong>{deploymentCount}</strong> máy hàn cáp</span></div>
        </div>
      </article>
      <article className="summary-card" style={ACCENT_STYLE.blue}>
        <a href={`${SHEET_BASE_URL}0`} target="_blank" rel="noreferrer" className="sheet-link" title="Mở file Google Sheet">
          <span className="material-symbols-outlined">open_in_new</span>
        </a>
        <div className="summary-icon"><span className="material-symbols-outlined text-[20px]">support_agent</span></div>
        <div className="min-w-0 flex-1">
          <p className="summary-label">Nhân sự PMB</p>
          <div className="summary-value-row"><p className="summary-value">{data.operators.length}</p><span className={`chip ${data.operators.length ? "chip-blue" : "chip-gray"}`}>{data.operators.length ? "Sẵn sàng ứng cứu" : "Chưa cập nhật"}</span></div>
          <div className="equipment-summary pmb-equipment"><span className="material-symbols-outlined">local_shipping</span><span>1 xe bán tải + 1 máy đo + 1 máy hàn</span></div>
        </div>
      </article>
    </section>
  );
}

function WeatherPanel({ rows, page, setPage }) {
  const current = pageItems(rows, page, PAGE_SIZE.weather);
  return (
    <article className="card weather-card" style={ACCENT_STYLE.blue}>
      <div className="card-header">
        <h2 className="card-title"><span className="material-symbols-outlined">thunderstorm</span>Thời tiết</h2>
        <Pager page={current.page} setPage={setPage} total={rows.length} size={PAGE_SIZE.weather} />
      </div>
      <div className="table-box">
        <table>
          <thead><tr><th style={{ width: "10%" }}>STT</th><th style={{ width: "31%" }}>Khu vực</th><th style={{ width: "30%" }}>Thời tiết</th><th style={{ width: "29%" }}>Di chuyển</th></tr></thead>
          <tbody>
            {!rows.length ? (
              <tr><td colSpan="4"><div className="empty-state">Chưa có dữ liệu trong tab Thời tiết.</div></td></tr>
            ) : current.rows.map((row, index) => (
              <tr key={`${row.stt}-${current.start + index}`} title={[row.area, row.weather, row.mobility].filter(Boolean).join(" | ")}>
                <td className="strong">{row.stt || String(current.start + index + 1)}</td>
                <td>{row.area || "-"}</td>
                <td>{weatherIcon(row.weather)} {row.weather || "-"}</td>
                <td><StatusChip status={row.mobility || "Chưa cập nhật"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function TasksPanel({ tasks, page, setPage }) {
  const current = pageItems(tasks, page, PAGE_SIZE.tasks);
  return (
    <article className="card tasks-card" style={ACCENT_STYLE.orange}>
      <div className="card-header">
        <h2 className="card-title"><span className="material-symbols-outlined">checklist</span>Công việc trong ngày</h2>
        <Pager page={current.page} setPage={setPage} total={tasks.length} size={PAGE_SIZE.tasks} />
      </div>
      <div className="list-box">
        {!tasks.length ? <div className="empty-state">Chưa có công việc trong tab Công việc.</div> : current.rows.map((task, index) => {
          const status = task.marker || "Cần theo dõi";
          const note = task.note || "Theo dõi và cập nhật diễn biến thực tế.";
          return (
            <div className="task-row" key={`${task.id}-${current.start + index}`} title={[task.id, task.name, task.marker, task.note].filter(Boolean).join(" | ")}>
              <div className="task-icon"><span className="material-symbols-outlined text-[15px]">check_circle</span></div>
              <div className="min-w-0">
                <span className="line-1">{task.name || "-"}</span>
                <span className="line-2">CV-{task.id || String(current.start + index + 1)}</span>
                <span className="line-3">{note}</span>
              </div>
              <StatusChip status={status} />
            </div>
          );
        })}
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
  if (!edge || (edge.status !== 'incident_external' && edge.status !== 'resolved')) return null;

  const targetName = edge.name.trim();

  const matchIncident = (target: string) => {
    if (!target) return false;
    const cleanTarget = target.replace(/\s+/g, '').toLowerCase();
    const cleanSearchTarget = targetName.replace(/tuyến/i, '').replace(/\s+/g, '').toLowerCase();

    const parts = cleanTarget.split('-');
    if (parts.length >= 2) {
      const forward = `${parts[0]}-${parts[1]}`;
      const backward = `${parts[1]}-${parts[0]}`;
      return cleanSearchTarget === forward || cleanSearchTarget === backward || cleanTarget.includes(cleanSearchTarget);
    }
    return cleanTarget === cleanSearchTarget;
  };

  const incident = incidents.find((inc: any) => matchIncident(inc.target));

  const style: React.CSSProperties = {
    position: 'absolute',
    left: menu.x,
    top: menu.y,
    transform: 'translate(-50%, 16px)',
    background: 'white',
    padding: '12px 16px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 1000,
    minWidth: '220px',
    fontSize: '13px',
    color: '#333'
  };

  if (style.top && (style.top as number) > window.innerHeight - 150) {
    style.transform = 'translate(-50%, -100%)';
    style.marginTop = '-16px';
  }

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

  const isResolved = incident.status?.toLowerCase().includes('hoàn thành') || edge.status === 'resolved';

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

function EmptyData() {
  return {
    cableIncidents: [], stationIncidents: [], incidents: [], affectedStations: [], affectedRoutes: [], deployments: [], operators: [], weatherRows: [], tasks: []
  };
}

export default function App() {
  const reportRef = useRef(null);
  const [captureMode, setCaptureMode] = useState(new URLSearchParams(window.location.search).get("capture") === "1");
  const [data, setData] = useState(EmptyData);
  const [lastUpdated, setLastUpdated] = useState("Đang tải dữ liệu Google Sheet...");
  const [pages, setPages] = useState({ cable: 0, station: 0, weather: 0, tasks: 0 });
  const [capturing, setCapturing] = useState(false);

  // --- Map State ---
  const [mapState, mapDispatch] = useReducer(mapReducer, EMPTY_MAP_STATE);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
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
        const edgeMap = new Map(dbEdges.map(e => [e.id, e.status]));

        nodes.forEach(n => { if (nodeMap.has(n.id)) n.status = nodeMap.get(n.id); });
        edges.forEach(e => { if (edgeMap.has(e.id)) e.status = edgeMap.get(e.id); });

        mapDispatch({ type: 'INIT_DATA', nodes, edges });
        dbTeams.forEach(t => mapDispatch({ type: 'ADD_TEAM', team: t }));

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
        if (payload.new && payload.new.id) mapDispatch({ type: 'SET_EDGE_STATUS', id: payload.new.id, status: payload.new.status });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          mapDispatch({ type: 'REMOVE_TEAM', id: payload.old.id });
        } else if (payload.new) {
          // Both INSERT and UPDATE map to UPDATE_TEAM to merge state. 
          // If the team doesn't exist locally, we must dispatch ADD_TEAM first.
          // Wait, our reducer UPDATE_TEAM only updates if exists.
          mapDispatch({ type: 'ADD_TEAM', team: payload.new as any });
          mapDispatch({ type: 'UPDATE_TEAM', id: payload.new.id, patch: payload.new as any });
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
    mapDispatch({ type: 'SET_EDGE_STATUS', id, status }); // Optimistic local
    await supabase.from('edges_status').upsert({ id, status });
  }, [session]);

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
    for (const node of mapState.nodes) {
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
  }, [mapState.nodes, session]);

  const handleTeamNameChange = useCallback(async (teamId: string, name: string) => {
    mapDispatch({ type: 'UPDATE_TEAM', id: teamId, patch: { name } });
    if (session) await supabase.from('teams').update({ name }).eq('id', teamId);
  }, [session]);

  const handleTeamTypeChange = useCallback(async (teamId: string, type: string) => {
    mapDispatch({ type: 'UPDATE_TEAM', id: teamId, patch: { type: type as TeamType } });
    if (session) await supabase.from('teams').update({ type }).eq('id', teamId);
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
    ? mapState.nodes.find((n) => n.id === mapState.contextMenu?.targetId)?.status
    : undefined;
  const contextEdgeStatus = mapState.contextMenu?.targetType === 'edge'
    ? mapState.edges.find((e) => e.id === mapState.contextMenu?.targetId)?.status
    : undefined;

  const pendingTeam = pendingTeamIdRef.current
    ? mapState.teams.find((t) => t.id === pendingTeamIdRef.current) ?? null
    : null;

  const loadDashboard = useCallback(async () => {
    setLastUpdated("Đang tải dữ liệu Google Sheet...");
    try {
      const nextData = await loadDashboardData();
      setData(nextData);
      setPages({ cable: 0, station: 0, weather: 0, tasks: 0 });
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

  const captureReport = async () => {
    if (!mapInstanceRef.current) {
      alert("Bản đồ chưa sẵn sàng!");
      return;
    }
    setCapturing(true);
    setCaptureMode(true);
    try {
      // 1. Lấy ảnh map đã render SVG và marker
      const mapDataURL = await exportMapImage({
        map: mapInstanceRef.current,
        operatorName: mapState.operatorName,
        edges: mapState.edges,
        nodes: mapState.nodes,
        teams: mapState.teams,
        showTeamNames: mapState.showTeamNames,
        returnUrl: true,
      });

      // 2. Ẩn map tương tác, hiển thị ảnh tĩnh
      const mapCanvasWrap = document.querySelector('.map-canvas-wrap') as HTMLElement;
      const imageSlot = document.querySelector('.image-slot') as HTMLElement;

      let tempImg: HTMLImageElement | null = null;
      if (mapCanvasWrap && imageSlot) {
        mapCanvasWrap.style.display = 'none';
        tempImg = document.createElement('img');
        tempImg.src = mapDataURL as string;
        tempImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
        imageSlot.insertBefore(tempImg, mapCanvasWrap);
      }

      // FIX #1: Chờ font load xong (Inter, Material Symbols)
      await document.fonts.ready;
      await new Promise(res => setTimeout(res, 200));

      // 3. Chụp bằng html-to-image
      const dashboardElement = document.querySelector('.dashboard-shell') as HTMLElement;
      if (!dashboardElement) throw new Error("Không tìm thấy dashboard");

      // Lưu lại style cũ và ép kích thước Desktop nếu màn hình đang hẹp hoặc lùn
      const originalWidth = dashboardElement.style.width;
      const originalHeight = dashboardElement.style.height;
      const originalTransform = dashboardElement.style.transform;

      if (dashboardElement.offsetWidth < 1366 || dashboardElement.offsetHeight < 768) {
        dashboardElement.style.width = '1366px';
        dashboardElement.style.height = '768px';
        dashboardElement.style.transform = 'none';
        await new Promise(res => setTimeout(res, 200)); // Chờ layout cập nhật
      }

      const dataUrl = await htmlToImage.toPng(dashboardElement, {
        backgroundColor: '#f3f7fb',
        pixelRatio: window.devicePixelRatio || 1.5,
      });

      // Trả lại kích thước ban đầu
      dashboardElement.style.width = originalWidth;
      dashboardElement.style.height = originalHeight;
      dashboardElement.style.transform = originalTransform;

      // 4. Download file
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
      link.download = `bao-cao-bao-noc-${timestamp}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();

      // 5. Cleanup
      if (mapCanvasWrap && tempImg && imageSlot) {
        imageSlot.removeChild(tempImg);
        mapCanvasWrap.style.display = '';
      }
    } catch (error: any) {
      console.error(error);
      alert(`Chưa chụp được báo cáo: ${error.message}`);
    } finally {
      setCaptureMode(false);
      setCapturing(false);
    }
  };


  return (
    <main id="report-page" className="dashboard-shell" ref={reportRef}>
      <header className="topbar">
        <div className="flex items-center gap-3 min-w-0">
          <div className="brand-logo-frame"><img src="/fpt-telecom-logo.svg" alt="FPT Telecom" /></div>
          <h1 className="truncate">Dashboard Báo Cáo Bão QLVHMB</h1>
          <a href={`https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_GOOGLE_SHEET_ID || "1fTDLSaxfzLU4XZnPwVhLqIdFNX4-1SdSMpdvyO372nk"}/edit`} target="_blank" rel="noreferrer" title="Mở file Google Sheet" className="text-slate-400 hover:text-[var(--fpt-blue)] transition-colors flex items-center text-sm underline ml-1">
            Xem chi tiết
          </a>
        </div>
        {!captureMode && <div className="flex items-center gap-2 no-capture">
          <div className="update-badge"><span className="material-symbols-outlined text-[15px]">update</span><span>{lastUpdated}</span></div>
          <button className="capture-button" title="Chụp dashboard thành ảnh PNG" onClick={captureReport} disabled={capturing}>
            <span className="material-symbols-outlined text-[17px]">{capturing ? "hourglass_top" : "photo_camera"}</span><span>{capturing ? "Đang chụp..." : "Chụp"}</span>
          </button>
          <button className="icon-btn" title="Tải lại dữ liệu" onClick={loadDashboard}><span className="material-symbols-outlined text-[18px]">refresh</span></button>

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
        <SummaryGrid data={data} />
        <WeatherPanel rows={data.weatherRows} page={pages.weather} setPage={(page) => setPages((old) => ({ ...old, weather: page }))} />
        <section className="content-grid">
          <HiddenIncidentTables data={data} pages={pages} setPages={setPages} />
          <TasksPanel tasks={data.tasks} page={pages.tasks} setPage={(page) => setPages((old) => ({ ...old, tasks: page }))} />
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
                          edges: mapState.edges,
                          nodes: mapState.nodes,
                          teams: mapState.teams,
                          showTeamNames: mapState.showTeamNames,
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
                edges={mapState.edges}
                nodes={mapState.nodes}
                teams={mapState.teams}
                sidebarCollapsed={false}
                showTeamNames={mapState.showTeamNames}
                onToggleTeamNames={() => mapDispatch({ type: 'TOGGLE_TEAM_NAMES' })}
                onContextMenu={(menu) => mapDispatch({ type: 'OPEN_CONTEXT', menu })}
                onCloseContextMenu={() => mapDispatch({ type: 'CLOSE_CONTEXT' })}
                onTeamDrop={handleTeamDrop}
                onMapReady={(map) => { mapInstanceRef.current = map; }}
                pendingTeam={pendingTeam}
                onTeamNameChange={handleTeamNameChange}
                onTeamTypeChange={handleTeamTypeChange}
                onConfirmTeam={handleConfirmTeam}
                onRemoveTeam={handleRemoveTeam}
              />
              {mapState.contextMenu?.visible && session && (
                <ContextMenu
                  menu={mapState.contextMenu}
                  currentNodeStatus={contextNodeStatus}
                  currentEdgeStatus={contextEdgeStatus}
                  onNodeStatusChange={handleNodeStatus}
                  onEdgeStatusChange={handleEdgeStatus}
                  onClose={() => mapDispatch({ type: 'CLOSE_CONTEXT' })}
                />
              )}
              {mapState.contextMenu?.visible && !session && (
                <GuestIncidentPopup
                  menu={mapState.contextMenu}
                  edges={mapState.edges}
                  incidents={data.cableIncidents}
                  onClose={() => mapDispatch({ type: 'CLOSE_CONTEXT' })}
                />
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
