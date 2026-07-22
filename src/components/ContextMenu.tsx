import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NodeStatus, EdgeStatus, ContextMenuState, DashboardMode } from '../types';
import './ContextMenu.css';

interface ContextMenuProps {
  menu: ContextMenuState;
  currentNodeStatus?: NodeStatus;
  currentEdgeStatus?: EdgeStatus;
  mode: DashboardMode;
  onNodeStatusChange: (id: string, status: NodeStatus) => void;
  onEdgeStatusChange: (id: string, status: EdgeStatus) => void;
  onClose: () => void;
}

// Icons dynamically assigned below

const EDGE_OPTIONS: { value: EdgeStatus; label: string; icon: string; cls: string }[] = [
  { value: 'normal', label: 'Bình thường', icon: '─', cls: 'status-active' },
  { value: 'danger_zone', label: 'Khu vực nguy hiểm', icon: '─', cls: 'status-warning' },
  { value: 'incident_external', label: 'Sự cố ngoại vi', icon: '─', cls: 'status-danger' },
  { value: 'resolved', label: 'Đã khắc phục', icon: '✓', cls: 'status-resolved' },
];

// For Truoc Bao mode, we use these statuses
const EDGE_OPTIONS_TRUOC_BAO: { value: EdgeStatus; label: string; icon: string; cls: string }[] = [
  { value: 'safe', label: 'An toàn', icon: '─', cls: 'status-active' }, 
  { value: 'risky', label: 'Có nguy cơ', icon: '⚠️', cls: 'status-warning' }, 
  { value: 'unsafe', label: 'Mất an toàn', icon: '✕', cls: 'status-danger' }, 
];

const DAI_TRAM = ['TGO', 'MCU', 'GPU', 'BKE', 'BHA', 'TKE', 'DDG', 'KEP', 'TYN', 'NDH', 'BSN', 'THA', 'CGT', 'HMI', 'VINH', 'HPO', 'DLE', 'KAH', 'DHI', 'LTY', 'LTY2', 'DHA', 'LBO', 'HUE', 'PLC'];

const VIEWPORT_MARGIN = 16;

export const ContextMenu: React.FC<ContextMenuProps> = ({
  menu,
  currentNodeStatus,
  currentEdgeStatus,
  mode,
  onNodeStatusChange,
  onEdgeStatusChange,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y, opacity: 0 });

  // Close on outside click or Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // Clamp position to viewport dynamically based on content size
  useLayoutEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const left = Math.max(VIEWPORT_MARGIN, Math.min(menu.x, window.innerWidth - rect.width - VIEWPORT_MARGIN));
      const top = Math.max(VIEWPORT_MARGIN, Math.min(menu.y, window.innerHeight - rect.height - VIEWPORT_MARGIN));
      setPosition({ left, top, opacity: 1 });
    }
  }, [menu.x, menu.y, menu.targetType, menu.targetId]);

  const isNode = menu.targetType === 'node';
  const targetName = menu.targetId.replace(/^node_/, '');
  const isDaiTram = isNode && DAI_TRAM.includes(targetName);

  const NODE_OPTIONS: { value: NodeStatus; label: string; icon: string; cls: string }[] = [
    { value: 'active', label: 'Hoạt động', icon: isDaiTram ? '▲' : '⬟', cls: 'status-active' },
    { value: 'power_out', label: 'Mất điện lưới', icon: '🔺', cls: 'status-warning' },
    { value: 'isolated', label: 'Bị cô lập', icon: '⚠️', cls: 'status-danger' },
  ];

  const options = isNode ? NODE_OPTIONS : (mode === 'truoc_bao' ? EDGE_OPTIONS_TRUOC_BAO : EDGE_OPTIONS);
  const currentVal = isNode ? currentNodeStatus : currentEdgeStatus;

  const handleSelect = (val: string) => {
    if (isNode) onNodeStatusChange(menu.targetId, val as NodeStatus);
    else onEdgeStatusChange(menu.targetId, val as EdgeStatus);
    onClose();
  };

  return (
    <div
      ref={ref}
      className="context-menu glass"
      style={{ left: position.left, top: position.top, opacity: position.opacity }}
      onClick={(e) => e.stopPropagation()}
    >
      {isNode && (
        <>
          <div className="context-menu__header">
            <span className="context-menu__type-icon">📡</span>
            <div>
              <div className="context-menu__type-label">TRẠM</div>
              <div className="context-menu__id">{menu.targetId}</div>
            </div>
          </div>
          <div className="context-menu__divider" />
        </>
      )}
      <div className="context-menu__title">Chọn trạng thái</div>
      <div className="context-menu__options">
        {options.map((opt) => {
          const disabled = isNode && !isDaiTram && (opt.value === 'power_out' || opt.value === 'isolated');
          return (
            <button
              key={opt.value}
              className={`context-menu__option ${opt.cls} ${currentVal === opt.value ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
              onClick={() => { if (!disabled) handleSelect(opt.value); }}
              disabled={disabled}
              style={disabled ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
              title={disabled ? "Chỉ Đài trạm mới có thể đổi trạng thái này" : ""}
            >
              <span className="option-icon">{opt.icon}</span>
              <span className="option-label">{opt.label}</span>
              {currentVal === opt.value && <span className="option-check">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};
