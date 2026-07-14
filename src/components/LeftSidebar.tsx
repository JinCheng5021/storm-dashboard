import React, { useState } from 'react';
import type { EdgeFeature, Team } from '../types';
import './LeftSidebar.css';

interface LeftSidebarProps {
  edges: EdgeFeature[];
  teams: Team[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRemoveTeam: (id: string) => void;
  onEdgeClick: (edgeId: string) => void;
}

type Tab = 'incidents' | 'teams';

const EDGE_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  normal:            { label: 'Bình thường',     cls: 'badge-info' },
  danger_zone:       { label: 'Nguy hiểm',       cls: 'badge-warning' },
  incident_external: { label: 'Sự cố ngoại vi',  cls: 'badge-danger' },
  resolved:          { label: 'Đã khắc phục',    cls: 'badge-success' },
};

const TEAM_TYPE_COLOR: Record<string, string> = {
  FPT: 'var(--team-fpt)',
  DCV: '#FF2D2D',
  FFC: 'var(--team-ffc)',
};

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  edges,
  teams,
  collapsed,
  onToggleCollapse,
  onRemoveTeam,
  onEdgeClick,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('incidents');

  const incidents = edges.filter((e) => e.status !== 'normal');
  const resolved  = edges.filter((e) => e.status === 'resolved');
  const active_inc = edges.filter((e) => e.status === 'incident_external');

  return (
    <aside className={`left-sidebar glass ${collapsed ? 'collapsed' : ''}`}>
      {/* Collapse toggle button */}
      <button
        className="sidebar-toggle"
        onClick={onToggleCollapse}
        title={collapsed ? 'Mở rộng' : 'Thu gọn'}
        id="btn-sidebar-toggle"
      >
        {collapsed ? '▶' : '◀'}
      </button>

      {!collapsed && (
        <>
          {/* Header */}
          <div className="sidebar-header">
            <div className="sidebar-logo-row">
              <div className="sidebar-badge-group">
                <span className={`badge badge-danger`}>{active_inc.length} Sự cố</span>
                <span className={`badge badge-success`}>{resolved.length} Xử lý xong</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab ${activeTab === 'incidents' ? 'active' : ''}`}
                onClick={() => setActiveTab('incidents')}
                id="tab-incidents"
              >
                <span>⚡</span> Sự cố ({incidents.length})
              </button>
              <button
                className={`sidebar-tab ${activeTab === 'teams' ? 'active' : ''}`}
                onClick={() => setActiveTab('teams')}
                id="tab-teams"
              >
                <span>👷</span> Đội ({teams.length})
              </button>
            </div>
          </div>

          <div className="sidebar-body">
            {/* Tab: Incidents */}
            {activeTab === 'incidents' && (
              <div className="incident-list" id="incident-list">
                {incidents.length === 0 ? (
                  <div className="sidebar-empty">
                    <span>✅</span>
                    <p>Không có sự cố nào</p>
                  </div>
                ) : (
                  incidents.map((edge) => {
                    const { label, cls } = EDGE_STATUS_LABELS[edge.status] || { label: 'Khác', cls: 'badge-info' };
                    return (
                      <div
                        key={edge.id}
                        className={`incident-item ${edge.status === 'incident_external' ? 'is-active' : ''}`}
                        onClick={() => onEdgeClick(edge.id)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="incident-icon">
                          {edge.status === 'incident_external' ? '🔴' : edge.status === 'danger_zone' ? '⚠️' : '✅'}
                        </div>
                        <div className="incident-info">
                          <div className="incident-name">{edge.name}</div>
                          <span className={`badge ${cls}`}>{label}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab: Teams */}
            {activeTab === 'teams' && (
              <div className="team-list" id="team-list">
                {teams.length === 0 ? (
                  <div className="sidebar-empty">
                    <span>👷</span>
                    <p>Chưa có đội ứng cứu</p>
                    <p className="sidebar-empty-sub">Nhấn "+ Thêm đội ứng cứu" ở trên</p>
                  </div>
                ) : (
                  teams.map((team) => (
                    <div key={team.id} className="team-item">
                      <div
                        className="team-avatar"
                        style={{ background: TEAM_TYPE_COLOR[team.type] + '22', borderColor: TEAM_TYPE_COLOR[team.type] + '55' }}
                      >
                        <span style={{ color: TEAM_TYPE_COLOR[team.type] }}>👷</span>
                      </div>
                      <div className="team-info">
                        <div className="team-name">{team.name || '(Chưa đặt tên)'}</div>
                        <div className="team-meta">
                          <span className="badge badge-info">{team.type}</span>
                          {team.assignedNodeId && (
                            <span className="team-assigned">📌 {team.assignedNodeId.replace('node_', '')}</span>
                          )}
                        </div>
                      </div>
                      <button
                        className="team-remove"
                        onClick={() => onRemoveTeam(team.id)}
                        title="Xóa đội"
                      >✕</button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Footer: Legend mini */}
          <div className="sidebar-legend">
            <div className="legend-row"><span className="legend-line normal" />Tuyến bình thường</div>
            <div className="legend-row"><span className="legend-line danger" />Khu vực nguy hiểm</div>
            <div className="legend-row"><span className="legend-line incident" />Sự cố ngoại vi</div>
            <div className="legend-row"><span className="legend-line resolved" />Đã khắc phục</div>
            <div className="legend-row"><span className="legend-node active" />Trạm hoạt động</div>
            <div className="legend-row"><span className="legend-node power-out" />Mất điện lưới</div>
            <div className="legend-row"><span className="legend-node isolated" />Bị cô lập</div>
          </div>
        </>
      )}
    </aside>
  );
};
