import type maplibregl from 'maplibre-gl';
import type { EdgeFeature, NodeFeature, Team } from '../types';

interface ExportOptions {
  map: maplibregl.Map;
  operatorName: string;
  edges: EdgeFeature[];
  nodes: NodeFeature[];
  teams: Team[];
  showTeamNames: boolean;
  returnUrl?: boolean;
}


export async function exportMapImage(opts: ExportOptions): Promise<string | void> {
  const loadSvg = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });

  // Preload team SVG icons
  const [fptImg, dcvImg, ffcImg] = await Promise.all([
    loadSvg('/fpt.svg'),
    loadSvg('/dcv.svg'),
    loadSvg('/ffc.svg'),
  ]);

  return new Promise((resolve, reject) => {
    const { map, operatorName, edges, nodes, teams, showTeamNames } = opts;

    try {

      // Wait for the next render frame to ensure canvas buffer is full
      map.once('render', () => {
        // 1. Get WebGL canvas data URL directly (requires preserveDrawingBuffer)
        const mapCanvas = map.getCanvas();
        const w = mapCanvas.width;
        const h = mapCanvas.height;
        const dataURL = mapCanvas.toDataURL('image/png');

        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          try {
            // 2. Create composite canvas
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d')!;

            // Draw map image
            ctx.drawImage(img, 0, 0);

            // ── Legend (bottom-right) ─────────────────────────────────
            const legendItems: any[] = [
              { color: '#0066FF', dash: false, label: 'Tuyến bình thường' },
              { color: '#FFD600', dash: false, label: 'Tuyến nguy hiểm' },
              { color: '#FF0000', dash: false, label: 'Tuyến đang gặp sự cố' },
              { color: '#00C853', dash: false, label: 'Tuyến đã khắc phục' },
              { node: '▲', color: '#000000', label: 'Đài trạm' },
              { node: '⬟', color: '#FF8C00', label: 'MPOP' },
              { node: '▲', color: '#FF0000', label: 'Trạm mất điện' },
              { node: '⚠️', color: '#FF0000', label: 'Trạm cô lập' },
              { img: fptImg, label: 'Đội FPT' },
              { img: dcvImg, label: 'Đối tác ĐCV' },
              { img: ffcImg, label: 'Đối tác FFC' },
            ];

            const rows = Math.ceil(legendItems.length / 2);
            const legendPad = 14;
            const legendLineH = 26;
            const legendW = 320;
            const legendH = legendPad * 2 + rows * legendLineH + 12;
            const legendX = w - legendW - 16;
            const legendY = h - legendH - 46;

            // Legend background
            ctx.save();
            ctx.globalAlpha = 0.88;
            ctx.fillStyle = '#56595eff';
            roundRect(ctx, legendX, legendY, legendW, legendH, 10);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(102, 98, 98, 0.21)';
            ctx.lineWidth = 1;
            roundRect(ctx, legendX, legendY, legendW, legendH, 10);
            ctx.stroke();
            ctx.restore();

            // Legend title
            ctx.save();
            ctx.font = '600 13px Inter, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#7C8BAA';
            ctx.letterSpacing = '0.05em';
            ctx.fillText('CHÚ GIẢI BẢN ĐỒ', legendX + legendPad, legendY + legendPad + 6);
            ctx.restore();

            // Divider
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(legendX + legendPad, legendY + legendPad + 18);
            ctx.lineTo(legendX + legendW - legendPad, legendY + legendPad + 18);
            ctx.stroke();
            ctx.restore();

            legendItems.forEach((item, i) => {
              const col = i >= rows ? 1 : 0;
              const row = i % rows;
              const centerY = legendY + legendPad + 28 + row * legendLineH + (legendLineH / 2);
              const ix = legendX + legendPad + col * (legendW / 2);

              ctx.save();
              ctx.textBaseline = 'middle';
              if (item.dash !== undefined) {
                // Line symbol
                ctx.strokeStyle = item.color;
                ctx.lineWidth = item.dash ? 2.5 : 2;
                if (item.dash) ctx.setLineDash([5, 3]);
                ctx.beginPath();
                ctx.moveTo(ix, centerY);
                ctx.lineTo(ix + 28, centerY);
                ctx.stroke();
                ctx.setLineDash([]);
              } else if (item.img) {
                // Team icon
                ctx.drawImage(item.img, ix - 2, centerY - 9, 18, 18);
              } else {
                // Node symbol
                ctx.font = '14px sans-serif';
                ctx.fillStyle = item.color;
                ctx.fillText(item.node, ix + 6, centerY + 2);
              }

              ctx.font = '500 12px Inter, sans-serif';
              ctx.fillStyle = '#C8D0E0';
              ctx.fillText(item.label, ix + 36, centerY);
              ctx.restore();
            });

            // ── Get current time for filename ─────────────────────────
            const now = new Date();

            // ── Draw Team Markers ─────────────────────────────────────
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
                ctx.font = `600 ${11 * pixelRatioX}px Inter, sans-serif`;
                ctx.fillStyle = '#ff4444';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(team.name, px, py + iconH / 2 + 4 * pixelRatioY);
              }
            });
            ctx.restore();

            // 3. Trigger download or return URL
            const dataURLOut = canvas.toDataURL('image/png');
            if (opts.returnUrl) {
              resolve(dataURLOut);
            } else {
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
        };
        img.onerror = (err) => {
          console.error("Lỗi load dataURL của mapCanvas", err);
          alert("Lỗi load ảnh WebGL canvas!");
          reject(err);
        };
        img.src = dataURL;
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
