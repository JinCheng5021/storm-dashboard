export type NodeStatus = 'active' | 'power_out' | 'isolated';
export type EdgeStatus = 'normal' | 'incident_external' | 'danger_zone' | 'resolved';
export type TeamType = 'FPT' | 'DCV' | 'FFC';

export interface NodeFeature {
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat]
  status: NodeStatus;
}

export interface EdgeFeature {
  id: string;
  name: string;
  coordinates: [number, number][]; // array of [lng, lat]
  status: EdgeStatus;
}

export interface Team {
  id: string;
  name: string;
  type: TeamType;
  position: [number, number]; // [lng, lat]
  assignedNodeId?: string;
  editable?: boolean;
  note?: string;
  labelOffset?: { dx: number; dy: number };
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetId: string;
  targetType: 'node' | 'edge';
}

export interface MapViewState {
  nodes: NodeFeature[];
  edges: EdgeFeature[];
  teams: Team[];
  contextMenu: ContextMenuState | null;
  operatorName: string;
  sidebarCollapsed: boolean;
  showTeamNames: boolean;
}
