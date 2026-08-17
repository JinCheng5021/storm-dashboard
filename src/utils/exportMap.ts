import type vietmapgl from '@vietmap/vietmap-gl-js';
import type { EdgeFeature, NodeFeature, Team, DashboardMode } from '../types';

interface ExportOptions {
  map: vietmapgl.Map;
  operatorName: string;
  edges: EdgeFeature[];
  nodes: NodeFeature[];
  teams: Team[];
  showTeamNames: boolean;
  mode?: DashboardMode;
  returnCanvas?: boolean;
  returnUrl?: boolean;
}


export async function exportMapImage(opts: ExportOptions): Promise<HTMLCanvasElement | string | void> {
  const loadSvg = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });

  // Preload team SVG icons & station status icons
  const [fptImg, dcvImg, ffcImg, matDienImg, cautionImg] = await Promise.all([
    loadSvg('/fpt.svg'),
    loadSvg('/dcv.svg'),
    loadSvg('/ffc.svg'),
    loadSvg('/matdien.png'),
    loadSvg('/caution-icon.svg'),
  ]);

  return new Promise((resolve, reject) => {
    const { map, operatorName, edges, nodes, teams, showTeamNames, mode } = opts;

    try {

      // Wait for the next render frame to ensure canvas buffer is full
      map.once('render', () => {
        try {
          // 1. Get WebGL canvas directly (requires preserveDrawingBuffer: true)
          const mapCanvas = map.getCanvas();
          const w = mapCanvas.width;
          const h = mapCanvas.height;

          // 2. Create composite canvas & draw WebGL canvas directly (Canvas-to-Canvas, 0-copy, zero Base64 RAM overhead)
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;

          // Draw WebGL map canvas directly onto composite canvas
          ctx.drawImage(mapCanvas, 0, 0);

          // ── 1. Draw Team Markers ──────────────────────────────────
          const TEAM_ICONS_MAP: Record<string, HTMLImageElement> = { FPT: fptImg, DCV: dcvImg, FFC: ffcImg };

          const container = map.getContainer();
          const pixelRatioX = w / container.clientWidth;
          const pixelRatioY = h / container.clientHeight;

          ctx.save();
          teams.forEach(team => {
            const pt = map.project(team.position);
            const px = pt.x * pixelRatioX;
            const py = pt.y * pixelRatioY;
            const imgIcon = TEAM_ICONS_MAP[team.type] || fptImg;

            const iconW = 24 * pixelRatioX;
            const iconH = 24 * pixelRatioY;
            ctx.drawImage(imgIcon, px - iconW / 2, py - iconH / 2, iconW, iconH);

            if (showTeamNames && team.name && team.type === 'FPT') {
              let dx = 0, dy = 20; // default (Bottom)
              const markerEl = document.querySelector(`.team-marker[data-team-id="${team.id}"]`);
              if (markerEl) {
                const lineEl = markerEl.querySelector('.team-leader-line line');
                if (lineEl) {
                  dx = Number(lineEl.getAttribute('x2')) - 200;
                  dy = Number(lineEl.getAttribute('y2')) - 200;
                }
              }

              // Draw dashed line if not exactly centered at bottom
              if (dx !== 0 || dy !== 20) {
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(px + dx * pixelRatioX, py + dy * pixelRatioY);
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1 * Math.max(pixelRatioX, 1);
                ctx.setLineDash([4 * pixelRatioX, 4 * pixelRatioX]);
                ctx.stroke();
                ctx.setLineDash([]);
              }

              const displayText = team.note ? `${team.name}\n(${team.note})` : team.name;
              const textLines = displayText.split('\n');
              
              const fontSize = 11 * pixelRatioX;
              ctx.font = `600 ${fontSize}px Inter, sans-serif`;

              let maxW = 0;
              textLines.forEach(line => {
                maxW = Math.max(maxW, ctx.measureText(line).width);
              });
              
              const padX = 8 * pixelRatioX;
              const padY = 2 * pixelRatioY;
              const lineH = 14 * pixelRatioY;
              const boxW = maxW + padX * 2;
              const boxH = textLines.length * lineH + padY * 2;
              
              const alignX = -boxW / 2;
              const alignY = -boxH / 2;
              const boxLeft = px + dx * pixelRatioX + alignX;
              const boxTop = py + dy * pixelRatioY + alignY;
              
              // Draw white background
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(boxLeft, boxTop, boxW, boxH);
              
              // Draw border
              ctx.strokeStyle = '#e2e8f0';
              ctx.lineWidth = 1 * Math.max(pixelRatioX, 1);
              ctx.strokeRect(boxLeft, boxTop, boxW, boxH);
              
              // Draw text
              ctx.fillStyle = '#ff4444';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'top';
              textLines.forEach((line, i) => {
                const lineW = ctx.measureText(line).width;
                // Center text horizontally in the box
                ctx.fillText(line, boxLeft + padX + (maxW - lineW) / 2, boxTop + padY + i * lineH);
              });
            }
          });
          ctx.restore();

          // ── 2. Legend (bottom-right - front-most layer) ───────────
          const edgeLegendItems = [
            { color: '#FF0000', dash: false, label: 'Tuyến ảnh hưởng\ntrực tiếp' },
            { color: '#FFD600', dash: false, label: 'Tuyến ảnh hưởng\ngián tiếp' },
            { color: '#0066FF', dash: false, label: 'Tuyến bình thường' },
          ];

          const incidentLegendItems = mode === 'trong_bao' ? [
            { customIcon: 'incident_x', label: 'Đang có SC' },
            { customIcon: 'incident_check', label: 'SC đã khắc phục' },
          ] : [];

          const legendItems: any[] = [
            ...edgeLegendItems,
            ...incidentLegendItems,
            { node: '⬟', color: '#FF8C00', label: 'MPOP' },
            { node: '▲', color: '#000000', label: 'Trạm bình thường' },
            { img: matDienImg, label: 'Trạm mất điện' },
            { img: cautionImg, label: 'Trạm cô lập' },
            { img: fptImg, label: 'Đội FPT' },
            { img: dcvImg, label: 'Đối tác ĐCV' },
            { img: ffcImg, label: 'Đối tác FFC' },
          ];

          // ── CẤU HÌNH LEGEND (Thay đổi LEGEND_ZOOM để phóng to/thu nhỏ toàn bộ Legend) ──
          const LEGEND_ZOOM = 0.8; // 1.0 = 100%, 1.2 = 120%, 0.8 = 80%

          const LEGEND_CONFIG = {
            width: 280,           // Chiều rộng khung chú giải (thu nhỏ gọn gàng)
            paddingX: 10,         // Lề ngang trong khung
            paddingTop: 10,       // Lề trên
            paddingBottom: 12,    // Lề dưới
            lineHeight: 27,       // Chiều cao mỗi dòng (khoảng cách giữa các dòng nhỏ lại)
            titleFontSize: 12.5,  // Cỡ chữ tiêu đề "CHÚ GIẢI BẢN ĐỒ"
            itemFontSize: 11,     // Cỡ chữ các mục chú giải
            nodeFontSize: 12,     // Cỡ biểu tượng Trạm (⬟, ▲, ⚠️)
            teamIconSize: 16,     // Kích thước icon Đội (FPT, ĐCV, FFC)
            lineSymbolLength: 22, // Độ dài nét vẽ tuyến cáp
            borderRadius: 8,      // Độ bo góc khung
          };

          const scale = Math.max(pixelRatioX, 1) * LEGEND_ZOOM;

          const rows = Math.ceil(legendItems.length / 2);
          const legendPadX = LEGEND_CONFIG.paddingX * scale;
          const legendPadTop = LEGEND_CONFIG.paddingTop * scale;
          const legendPadBottom = LEGEND_CONFIG.paddingBottom * scale;
          const legendLineH = LEGEND_CONFIG.lineHeight * scale;
          const legendW = LEGEND_CONFIG.width * scale;
          const headerH = 22 * scale;
          const legendH = legendPadTop + headerH + rows * legendLineH + legendPadBottom;
          const legendX = w - legendW - 10 * scale; // Thu nhỏ khoảng cách với lề bên phải
          const legendY = h - legendH - 10 * scale; // Thu nhỏ khoảng cách với lề đáy

          // Legend background (Màu trắng đặc 100%, che phủ hoàn toàn bên dưới)
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
          ctx.shadowBlur = 12 * scale;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 4 * scale;

          ctx.fillStyle = '#FFFFFF';
          roundRect(ctx, legendX, legendY, legendW, legendH, LEGEND_CONFIG.borderRadius * scale);
          ctx.fill();

          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = '#E2E8F0';
          ctx.lineWidth = 1.5 * scale;
          roundRect(ctx, legendX, legendY, legendW, legendH, LEGEND_CONFIG.borderRadius * scale);
          ctx.stroke();
          ctx.restore();

          // Legend title
          ctx.save();
          ctx.font = `700 ${Math.round(LEGEND_CONFIG.titleFontSize * scale)}px Inter, sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#0F172A';
          ctx.letterSpacing = '0.04em';
          ctx.fillText('CHÚ GIẢI BẢN ĐỒ', legendX + legendPadX, legendY + legendPadTop + 6 * scale);
          ctx.restore();

          // Divider
          ctx.save();
          ctx.strokeStyle = '#E2E8F0';
          ctx.lineWidth = 1 * scale;
          ctx.beginPath();
          ctx.moveTo(legendX + legendPadX, legendY + legendPadTop + 16 * scale);
          ctx.lineTo(legendX + legendW - legendPadX, legendY + legendPadTop + 16 * scale);
          ctx.stroke();
          ctx.restore();

          legendItems.forEach((item, i) => {
            const col = i >= rows ? 1 : 0;
            const row = i % rows;
            const colW = (legendW - legendPadX * 2) / 2;
            const centerY = legendY + legendPadTop + headerH + row * legendLineH + (legendLineH / 2);
            const ix = legendX + legendPadX + col * colW;

            ctx.save();
            ctx.textBaseline = 'middle';
            if (item.dash !== undefined) {
              // Line symbol
              ctx.strokeStyle = item.color;
              ctx.lineWidth = (item.dash ? 2.5 : 2.5) * scale;
              if (item.dash) ctx.setLineDash([5 * scale, 3 * scale]);
              ctx.beginPath();
              ctx.moveTo(ix, centerY);
              ctx.lineTo(ix + LEGEND_CONFIG.lineSymbolLength * scale, centerY);
              ctx.stroke();
              ctx.setLineDash([]);
            } else if (item.customIcon === 'incident_x') {
              // Dấu X đỏ viền trắng
              const cx = ix + (LEGEND_CONFIG.lineSymbolLength / 2) * scale;
              const cy = centerY;
              const r = 5 * scale;
              const drawX = () => {
                ctx.beginPath();
                ctx.moveTo(cx - r, cy - r);
                ctx.lineTo(cx + r, cy + r);
                ctx.moveTo(cx + r, cy - r);
                ctx.lineTo(cx - r, cy + r);
                ctx.stroke();
              };
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 3.5 * scale;
              drawX();
              ctx.strokeStyle = '#FF0000';
              ctx.lineWidth = 2 * scale;
              drawX();
            } else if (item.customIcon === 'incident_check') {
              // Dấu V xanh viền trắng
              const cx = ix + (LEGEND_CONFIG.lineSymbolLength / 2) * scale;
              const cy = centerY;
              const drawCheck = () => {
                ctx.beginPath();
                ctx.moveTo(cx - 5 * scale, cy + 0.5 * scale);
                ctx.lineTo(cx - 1.5 * scale, cy + 4 * scale);
                ctx.lineTo(cx + 5.5 * scale, cy - 4 * scale);
                ctx.stroke();
              };
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 3.5 * scale;
              drawCheck();
              ctx.strokeStyle = '#00C853';
              ctx.lineWidth = 2 * scale;
              drawCheck();
            } else if (item.img) {
              // Team icon
              const iconDim = LEGEND_CONFIG.teamIconSize * scale;
              ctx.drawImage(item.img, ix + 3 * scale, centerY - iconDim / 2, iconDim, iconDim);
            } else {
              // Node symbol
              ctx.font = `${Math.round(LEGEND_CONFIG.nodeFontSize * scale)}px sans-serif`;
              ctx.fillStyle = item.color;
              ctx.fillText(item.node, ix + 4 * scale, centerY + 1 * scale);
            }

            ctx.font = `500 ${Math.round(LEGEND_CONFIG.itemFontSize * scale)}px Inter, sans-serif`;
            ctx.fillStyle = '#1E293B';
            const textX = ix + (LEGEND_CONFIG.lineSymbolLength + 6) * scale;

            const lines = item.label.split('\n');
            if (lines.length > 1) {
              const lineSpacing = 11 * scale;
              const startTextY = centerY - ((lines.length - 1) * lineSpacing) / 2;
              lines.forEach((lineText: string, lineIdx: number) => {
                ctx.fillText(lineText, textX, startTextY + lineIdx * lineSpacing);
              });
            } else {
              ctx.fillText(item.label, textX, centerY);
            }
            ctx.restore();
          });

          // 3. Output canvas, URL, or trigger download
          if (opts.returnCanvas) {
            resolve(canvas);
          } else if (opts.returnUrl) {
            resolve(canvas.toDataURL('image/png'));
          } else {
            const now = new Date();
            const dataURLOut = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = dataURLOut;
            a.download = `NOC_TacChien_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            resolve();
          }
        } catch (err) {
          console.error("Lỗi khi vẽ composite canvas:", err);
          alert("Lỗi khi vẽ ảnh map: " + err);
          reject(err);
        }
      });

      // Force a repaint so the 'render' event fires and fills the buffer
      map.triggerRepaint();
    } catch (err) {
      alert("Lỗi khởi tạo export: " + err);
      reject(err);
    }
  });
}

// ── Canvas helpers ──────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function roundRectTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
