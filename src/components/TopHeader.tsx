import React from 'react';
import './TopHeader.css';

interface TopHeaderProps {
  incidentCount: number;
  operatorName: string;
  onOperatorNameChange: (name: string) => void;
  onAddTeam: () => void;
  onExport: () => void;
  sidebarCollapsed: boolean;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  incidentCount,
  operatorName,
  onOperatorNameChange,
  onAddTeam,
  onExport,
  sidebarCollapsed,
}) => {
  return (
    <header
      className="top-header glass"
      style={{ left: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)' }}
    >
      {/* Left: Branding */}
      <div className="top-header__brand">
        <div className="top-header__logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#0066FF" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="4" fill="#0066FF" />
            <line x1="12" y1="2"  x2="12" y2="7"  stroke="#0066FF" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="12" y1="17" x2="12" y2="22" stroke="#0066FF" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="2"  y1="12" x2="7"  y2="12" stroke="#0066FF" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="17" y1="12" x2="22" y2="12" stroke="#0066FF" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <div className="top-header__title">NOC Dashboard</div>
          <div className="top-header__subtitle">Giám sát vận hành hạ tầng mạng</div>
        </div>
      </div>

      {/* Center: Stats */}
      <div className="top-header__stats">
        <div className={`top-header__stat-chip ${incidentCount > 0 ? 'has-incident' : ''}`}>
          <span className="stat-dot" />
          <span className="stat-value">{incidentCount}</span>
          <span className="stat-label">sự cố</span>
        </div>
        <div className="top-header__region">
          <span className="region-icon">🗺</span>
          <span>Toàn quốc</span>
        </div>
      </div>

      {/* Right: Controls */}
      <div className="top-header__controls">
        <div className="operator-input-wrap">
          <span className="operator-icon">👤</span>
          <input
            type="text"
            className="operator-input"
            placeholder="Người điều hành..."
            value={operatorName}
            onChange={(e) => onOperatorNameChange(e.target.value)}
          />
        </div>
        <button className="btn btn-ghost" id="btn-add-team" onClick={onAddTeam}>
          <span>➕</span>
          <span>Thêm đội ứng cứu</span>
        </button>
        <button className="btn btn-primary" id="btn-export" onClick={onExport}>
          <span>🚀</span>
          <span>Xuất ảnh tác chiến</span>
        </button>
      </div>
    </header>
  );
};
