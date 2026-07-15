import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {
  EdgeFeature,
  NodeFeature,
  Team,
  ContextMenuState,
  TeamType,
} from '../types';
import './MapCanvas.css';

interface MapCanvasProps {
  edges: EdgeFeature[];
  nodes: NodeFeature[];
  teams: Team[];
  sidebarCollapsed: boolean;
  onContextMenu: (state: ContextMenuState) => void;
  onCloseContextMenu: () => void;
  onTeamDrop: (teamId: string, lngLat: [number, number]) => void;
  onMapReady?: (map: maplibregl.Map) => void;
  pendingTeam: Team | null;
  onTeamNameChange: (teamId: string, name: string) => void;
  onTeamTypeChange: (teamId: string, type: TeamType) => void;
  onConfirmTeam: (teamId: string) => void;
  onRemoveTeam: (teamId: string) => void;
  showTeamNames: boolean;
  onToggleTeamNames: () => void;
}

// Map bounds for Vietnam (north)
const INIT_CENTER: [number, number] = [105.8, 20.5];
const INIT_ZOOM = 6.5;

// Derive GeoJSON FeatureCollections from state
function edgesGeoJSON(edges: EdgeFeature[]) {
  return {
    type: 'FeatureCollection' as const,
    features: edges.map((e) => ({
      type: 'Feature' as const,
      properties: { id: e.id, name: e.name, status: e.status },
      geometry: { type: 'LineString' as const, coordinates: e.coordinates },
    })),
  };
}

function nodesGeoJSON(nodes: NodeFeature[]) {
  return {
    type: 'FeatureCollection' as const,
    features: nodes.map((n) => ({
      type: 'Feature' as const,
      properties: { id: n.id, name: n.name, status: n.status },
      geometry: { type: 'Point' as const, coordinates: n.coordinates },
    })),
  };
}

const TEAM_COLORS: Record<TeamType, string> = {
  FPT: '#39FF14', // Xanh lá
  DCV: '#FF2D2D', // Đỏ
  FFC: '#FFD600', // Vàng
};

function createShapeImage(shape: 'triangle' | 'pentagon' | 'warning', size: number, color: string): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  if (shape === 'warning') {
    ctx.font = `${size * 0.7}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚠️', size / 2, size / 2 + size * 0.05);
    return ctx.getImageData(0, 0, size, size);
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  const r = size / 2;
  const cx = size / 2;
  const cy = size / 2;

  if (shape === 'triangle') {
    ctx.moveTo(cx, cy - r * 0.6);
    ctx.lineTo(cx + r * 0.7, cy + r * 0.6);
    ctx.lineTo(cx - r * 0.7, cy + r * 0.6);
  } else if (shape === 'pentagon') {
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const x = cx + r * 0.7 * Math.cos(angle);
      const y = cy + r * 0.7 * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

const DAI_TRAM = ['TGO', 'MCU', 'GPU', 'BKE', 'BHA', 'TKE', 'DDG', 'KEP', 'TYN', 'NDH', 'BSN', 'THA', 'CGT', 'HMI', 'VINH', 'HPO', 'DLE', 'KAH', 'DHI', 'LTY', 'LTY2', 'DHA', 'LBO', 'HUE', 'PLC'];

export const MapCanvas: React.FC<MapCanvasProps> = ({
  edges,
  nodes,
  teams,
  sidebarCollapsed,
  onContextMenu,
  onCloseContextMenu,
  onTeamDrop,
  onMapReady,
  pendingTeam,
  onTeamNameChange,
  onTeamTypeChange,
  onConfirmTeam,
  onRemoveTeam,
  showTeamNames,
  onToggleTeamNames,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const tooltipRef = useRef<maplibregl.Popup | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const isDraggingTeamRef = useRef(false);

  // ── Init map ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: INIT_CENTER,
      zoom: INIT_ZOOM,
      maxBounds: [[95, 7], [115, 24]] as [[number, number], [number, number]],
      preserveDrawingBuffer: true, // Required for map.getCanvas().toDataURL()
    } as maplibregl.MapOptions);

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

    map.on('load', () => {
      // ── Background wash (fades the carto basemap) ──
      map.addSource('world-wash', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]]
          },
          properties: {}
        }
      });
      map.addLayer({
        id: 'map-wash-layer',
        type: 'fill',
        source: 'world-wash',
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': 0.15 // Tăng giảm độ mờ của map ở đây (0.0 đến 1.0)
        }
      });

      map.addImage('icon-triangle', createShapeImage('triangle', 32, '#000000'));
      map.addImage('icon-triangle-red', createShapeImage('triangle', 32, '#FF0000'));
      map.addImage('icon-pentagon', createShapeImage('pentagon', 32, '#FF8C00'));
      map.addImage('icon-warning', createShapeImage('warning', 32, '#000000'));

      // ── Edge sources & layers ────────────────────────
      map.addSource('edges', {
        type: 'geojson',
        data: edgesGeoJSON(edges),
      });

      // Base edges (all states)
      map.addLayer({
        id: 'edges-base',
        type: 'line',
        source: 'edges',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-width': [
            'match',
            ['get', 'status'],
            'incident_external', 3.5,
            'danger_zone', 3.5,
            'resolved', 3,
            2 // normal
          ],
          'line-color': [
            'match',
            ['get', 'status'],
            'incident_external', '#FF0000',
            'danger_zone', '#FFD600',
            'resolved', '#00C853',
            '#0066FF' // normal
          ],
          'line-opacity': [
            'match',
            ['get', 'status'],
            'incident_external', 1,
            'danger_zone', 1,
            'resolved', 1,
            0.7
          ],
        },
      });

      // Edge hover highlight (invisible, catches clicks)
      map.addLayer({
        id: 'edges-hitbox',
        type: 'line',
        source: 'edges',
        paint: { 'line-width': 14, 'line-opacity': 0 },
      });

      // ── Node source ─────────────────────────────────
      map.addSource('nodes', {
        type: 'geojson',
        data: nodesGeoJSON(nodes),
      });

      // Base nodes (circle) - All nodes
      map.addLayer({
        id: 'nodes-base',
        type: 'circle',
        source: 'nodes',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 10, 9, 14, 14],
          'circle-color': '#00C2FF',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.95,
        },
      });

      // Inner Icon for Node Types (DaiTram vs MPOP)
      map.addLayer({
        id: 'nodes-inner-icon',
        type: 'symbol',
        source: 'nodes',
        layout: {
          'icon-image': [
            'case',
            ['==', ['get', 'status'], 'isolated'], 'icon-warning',
            ['match',
              ['get', 'name'],
              DAI_TRAM, [
                'match',
                ['get', 'status'],
                'power_out', 'icon-triangle-red',
                'icon-triangle'
              ],
              'icon-pentagon'
            ]
          ],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.45, 10, 0.65, 14, 0.8],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        }
      });

      // Node hitbox (invisible, for easier clicking)
      map.addLayer({
        id: 'nodes-hitbox',
        type: 'circle',
        source: 'nodes',
        paint: {
          'circle-radius': 24,
          'circle-opacity': 0,
          'circle-color': '#000',
        },
      });

      // Node labels
      map.addLayer({
        id: 'node-labels',
        type: 'symbol',
        source: 'nodes',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 9, 10, 12, 14, 14],
          'text-offset': [0.8, 0.3],
          'text-anchor': 'left',

          // Đặt true để cho phép các tên trạm nằm đè lên nhau (nếu muốn)
          'text-allow-overlap': true,
          'text-ignore-placement': false,
          'text-padding': 1,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-max-width': 8,
          'visibility': 'visible',
        },
        paint: {
          'text-color': '#1A1A1A',
          'text-halo-color': 'rgba(255,255,255,0.9)',
          'text-halo-width': 2,

          // Chỉnh ngưỡng zoom hiện tên ở đây.
          // Ví dụ: 7 là mốc zoom. Ở zoom < 5 (7-2), độ mờ = 0 (ẩn). Ở zoom = 7, độ mờ = 1 (hiện rõ).
          'text-opacity': [
            'interpolate', ['linear'], ['zoom'],
            5, 0, // Dưới mốc này sẽ mờ tịt
            7, 1  // Bắt đầu từ mốc zoom 7 trở lên sẽ hiện rõ 100%
          ],
        },
      });

      // ── Interactions ─────────────────────────────────

      // Tooltip popup
      tooltipRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        anchor: 'bottom',
        offset: [0, -8],
      });

      const hitLayers = ['nodes-hitbox', 'edges-hitbox'];

      map.on('mousemove', (e) => {
        if (isDraggingTeamRef.current) {
          map.getCanvas().style.cursor = 'grabbing';
          tooltipRef.current?.remove();
          return;
        }

        const features = map.queryRenderedFeatures(e.point, { layers: hitLayers });
        if (features.length > 0) {
          map.getCanvas().style.cursor = 'pointer';
          const topFeature = features.find((f) => f.layer.id === 'nodes-hitbox') || features[0];

          if (topFeature.layer.id === 'nodes-hitbox') {
            const { name, status } = topFeature.properties as { name: string; status: string };
            const isDaiTram = DAI_TRAM.includes(name);
            const statusLabel = isDaiTram
              ? {
                active: '▲ Hoạt động',
                power_out: '🔺 Mất điện lưới',
                isolated: '⚠️ Bị cô lập',
              }[status] || status
              : '⬟ Hoạt động';

            tooltipRef.current
              ?.setLngLat(e.lngLat)
              .setHTML(`<div class="map-tooltip"><b>${name}</b><br/><span>${statusLabel}</span></div>`)
              .addTo(map);
          } else {
            const { name, status } = topFeature.properties as { name: string; status: string };
            const statusMap: Record<string, string> = {
              normal: '● Bình thường',
              incident_external: '⚠ Sự cố ngoại vi',
              danger_zone: '⚠ Khu vực nguy hiểm',
              resolved: '✓ Đã khắc phục',
            };
            tooltipRef.current
              ?.setLngLat(e.lngLat)
              .setHTML(`<div class="map-tooltip"><b>${name}</b><br/><span>${statusMap[status] ?? status}</span></div>`)
              .addTo(map);
          }
        } else {
          map.getCanvas().style.cursor = '';
          tooltipRef.current?.remove();
        }
      });

      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: hitLayers });
        if (features.length > 0) {
          e.preventDefault();
          const topFeature = features.find((f) => f.layer.id === 'nodes-hitbox') || features[0];
          const targetType = topFeature.layer.id === 'nodes-hitbox' ? 'node' : 'edge';

          onContextMenu({
            visible: true,
            x: e.point.x,
            y: e.point.y,
            targetId: String(topFeature.properties.id),
            targetType,
          });
        } else {
          onCloseContextMenu();
        }
      });

      mapRef.current = map;
      setMapReady(true);
      if (onMapReady) onMapReady(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync edge data ───────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const src = map.getSource('edges') as maplibregl.GeoJSONSource | undefined;
    src?.setData(edgesGeoJSON(edges));
  }, [edges, mapReady]);

  // ── Sync node data ───────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const src = map.getSource('nodes') as maplibregl.GeoJSONSource | undefined;
    src?.setData(nodesGeoJSON(nodes));
  }, [nodes, mapReady]);

  // ── Team markers ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const existingIds = new Set(markersRef.current.keys());
    const currentIds = new Set(teams.map((t) => t.id));

    // Remove stale markers
    existingIds.forEach((id) => {
      if (!currentIds.has(id)) {
        markersRef.current.get(id)?.remove();
        markersRef.current.delete(id);
      }
    });

    // Add / update markers
    teams.forEach((team) => {
      const color = TEAM_COLORS[team.type];

      // Dán 3 đoạn mã SVG của bạn vào trong cặp dấu backtick (` `)
      const TEAM_ICONS: Record<TeamType, string> = {
        FPT: `<img src="/fpt.svg" style="width: 32px; height: 32px; vertical-align: middle; background: transparent;" alt="FPT" />`,
        DCV: `<img src="/dcv.svg" style="width: 32px; height: 32px; vertical-align: middle; background: transparent;" alt="DCV" />`,
        FFC: `<img src="/ffc.svg" style="width: 32px; height: 32px; vertical-align: middle; background: transparent;" alt="FFC" />`
      };


      if (markersRef.current.has(team.id)) {
        const marker = markersRef.current.get(team.id)!;
        marker.setLngLat(team.position);

        // Lấy thẻ con .team-marker bên trong wrapper
        const wrapper = marker.getElement();
        const el = wrapper.querySelector('.team-marker') as HTMLElement;

        if (el) {
          el.style.setProperty('--team-color', color);
          el.title = team.name;

          // Chỉ cập nhật text nếu có sự thay đổi, tránh chớp hình
          const nameEl = el.querySelector('.team-marker__name') as HTMLElement;
          if (nameEl) {
            nameEl.style.display = team.type === 'FPT' ? '' : 'none';
            if (nameEl.textContent !== team.name) {
              nameEl.textContent = team.name;
            }
          }

          // Cập nhật icon nếu đổi type
          const iconEl = el.querySelector('.team-marker__icon');
          if (iconEl && iconEl.innerHTML !== TEAM_ICONS[team.type]) {
            iconEl.innerHTML = TEAM_ICONS[team.type];
          }

          // Cập nhật trạng thái nút xóa dựa trên editable
          const closeBtn = el.querySelector('.team-marker__close') as HTMLElement;
          if (closeBtn) {
            closeBtn.style.display = team.editable === false ? 'none' : 'flex';
          }

          // Cập nhật khả năng kéo thả
          marker.setDraggable(team.editable !== false);
        }
        return;
      }

      // Tạo thẻ vỏ bọc vô hình 0x0 để triệt tiêu lỗi offset của MapLibre
      const wrapper = document.createElement('div');
      wrapper.style.width = '0px';
      wrapper.style.height = '0px';

      const el = document.createElement('div');
      el.className = 'team-marker';
      el.style.position = 'absolute';
      el.style.transform = 'translate(-50%, -50%)'; // Tự neo tâm bằng CSS
      el.style.setProperty('--team-color', color);

      const closeBtnHtml = team.editable !== false
        ? `<button class="team-marker__close" title="Xóa đội">✕</button>`
        : '';

      const nameHtml = team.type === 'FPT'
        ? `<div class="team-marker__name">${team.name}</div>`
        : `<div class="team-marker__name" style="display: none">${team.name}</div>`;

      el.innerHTML = `<span class="team-marker__icon">${TEAM_ICONS[team.type]}</span>`
        + nameHtml
        + closeBtnHtml;
      el.title = team.name;

      wrapper.appendChild(el);

      // Gắn wrapper vào MapLibre, vô hiệu hóa draggable nếu editable = false
      const marker = new maplibregl.Marker({
        element: wrapper,
        draggable: team.editable !== false,
        anchor: 'center',
        offset: [0, 0]
      })
        .setLngLat(team.position)
        .addTo(map);

      el.querySelector('.team-marker__close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        onRemoveTeam(team.id);
      });

      marker.on('dragstart', () => {
        isDraggingTeamRef.current = true;
      });

      marker.on('dragend', () => {
        isDraggingTeamRef.current = false;
        const lngLat = marker.getLngLat();
        onTeamDrop(team.id, [lngLat.lng, lngLat.lat]);
      });

      markersRef.current.set(team.id, marker);
    });
  }, [teams, mapReady, onTeamDrop, onRemoveTeam]);

  // ── Pending team input popup ─────────────────────────────────
  const pendingPopupRef = useRef<maplibregl.Popup | null>(null);
  const currentPendingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    if (!pendingTeam) {
      pendingPopupRef.current?.remove();
      currentPendingIdRef.current = null;
      return;
    }

    // Nếu popup của đội này đang mở rồi thì không tạo lại nữa để tránh mất focus và bị giật con trỏ
    if (currentPendingIdRef.current === pendingTeam.id) {
      return;
    }

    pendingPopupRef.current?.remove();
    currentPendingIdRef.current = pendingTeam.id;

    const map = mapRef.current;
    const popupEl = document.createElement('div');
    popupEl.className = 'team-input-popup glass';
    popupEl.innerHTML = `
      <div class="tip-header">Đặt tên đội ứng cứu</div>
      <div class="tip-row">
        <input id="tip-name-${pendingTeam.id}" class="tip-input" type="text" placeholder="VD: BinhNT89 + BachDX6" value="${pendingTeam.name}" />
      </div>
      <div class="tip-row">
        <label class="tip-label">Loại đội:</label>
        <select id="tip-type-${pendingTeam.id}" class="tip-select">
          <option value="FPT"${pendingTeam.type === 'FPT' ? ' selected' : ''}>FPT</option>
          <option value="DCV"${pendingTeam.type === 'DCV' ? ' selected' : ''}>Đối tác ĐCV</option>
          <option value="FFC"${pendingTeam.type === 'FFC' ? ' selected' : ''}>Đối tác FFC</option>
        </select>
      </div>
      <button id="tip-confirm-${pendingTeam.id}" class="tip-confirm btn btn-primary">Xác nhận ✓</button>
    `;

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: '260px',
    })
      .setLngLat(pendingTeam.position)
      .setDOMContent(popupEl)
      .addTo(map);

    // Wire events after DOM is mounted
    setTimeout(() => {
      const nameEl = document.getElementById(`tip-name-${pendingTeam.id}`) as HTMLInputElement | null;
      const typeEl = document.getElementById(`tip-type-${pendingTeam.id}`) as HTMLSelectElement | null;
      const btnEl = document.getElementById(`tip-confirm-${pendingTeam.id}`) as HTMLButtonElement | null;

      nameEl?.addEventListener('input', (e) => {
        onTeamNameChange(pendingTeam.id, (e.target as HTMLInputElement).value);
      });
      typeEl?.addEventListener('change', (e) => {
        onTeamTypeChange(pendingTeam.id, (e.target as HTMLSelectElement).value as TeamType);
      });
      btnEl?.addEventListener('click', () => {
        onConfirmTeam(pendingTeam.id);
        popup.remove();
      });
      nameEl?.focus();
    }, 50);

    pendingPopupRef.current = popup;
  }, [pendingTeam, mapReady, onConfirmTeam, onTeamNameChange, onTeamTypeChange]);

  // ── Resize on sidebar toggle ─────────────────────────────────
  useEffect(() => {
    setTimeout(() => mapRef.current?.resize(), 300);
  }, [sidebarCollapsed]);

  return (
    <div className={`map-canvas-wrap ${showTeamNames ? 'show-team-names' : ''}`}>
      <div ref={mapContainerRef} className="map-canvas" />

      {/* Nút ẩn/hiện tên đội */}
      <button
        className="icon-btn"
        title={showTeamNames ? 'Ẩn tên đội' : 'Hiện tên đội'}
        style={{ position: 'absolute', bottom: '24px', left: '24px', zIndex: 10, width: '36px', height: '36px', borderRadius: '50%', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', background: 'var(--bg-glass)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        onClick={onToggleTeamNames}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{showTeamNames ? 'visibility' : 'visibility_off'}</span>
      </button>
    </div>
  );
};
