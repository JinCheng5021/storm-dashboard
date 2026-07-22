import type { NodeFeature, Team, ContextMenuState, NodeStatus, EdgeStatus, MapViewState, TeamType } from './types';
import { parseGeoJSON } from './data/geojsonParser';

export type Action =
  | { type: 'SET_NODE_STATUS';  id: string; status: NodeStatus }
  | { type: 'SET_EDGE_STATUS';  id: string; status?: EdgeStatus; statusBeforeTyphoon?: EdgeStatus }
  | { type: 'ADD_TEAM';         team: Team }
  | { type: 'UPDATE_TEAM';      id: string; patch: Partial<Team> }
  | { type: 'REMOVE_TEAM';      id: string }
  | { type: 'OPEN_CONTEXT';     menu: ContextMenuState }
  | { type: 'CLOSE_CONTEXT' }
  | { type: 'SET_OPERATOR';     name: string }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'TOGGLE_TEAM_NAMES' }
  | { type: 'INIT_DATA';        nodes: NodeFeature[]; edges: ReturnType<typeof parseGeoJSON>['edges'] };

export function mapReducer(state: MapViewState, action: Action): MapViewState {
  switch (action.type) {
    case 'INIT_DATA':
      return { ...state, nodes: action.nodes, edges: action.edges };
    case 'SET_NODE_STATUS':
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === action.id ? { ...n, status: action.status } : n
        ),
      };
    case 'SET_EDGE_STATUS':
      return {
        ...state,
        edges: state.edges.map((e) => {
          if (e.id !== action.id) return e;
          const updates: Partial<typeof e> = {};
          if (action.status) updates.status = action.status;
          if (action.statusBeforeTyphoon) updates.statusBeforeTyphoon = action.statusBeforeTyphoon;
          return { ...e, ...updates };
        }),
      };
    case 'ADD_TEAM': {
      const exists = state.teams.some(t => t.id === action.team.id);
      if (exists) {
        return {
          ...state,
          teams: state.teams.map((t) =>
            t.id === action.team.id ? { ...t, ...action.team } : t
          ),
        };
      }
      return { ...state, teams: [...state.teams, action.team] };
    }
    case 'UPDATE_TEAM':
      return {
        ...state,
        teams: state.teams.map((t) =>
          t.id === action.id ? { ...t, ...action.patch } : t
        ),
      };
    case 'REMOVE_TEAM':
      return { ...state, teams: state.teams.filter((t) => t.id !== action.id) };
    case 'OPEN_CONTEXT':
      return { ...state, contextMenu: action.menu };
    case 'CLOSE_CONTEXT':
      return { ...state, contextMenu: null };
    case 'SET_OPERATOR':
      return { ...state, operatorName: action.name };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case 'TOGGLE_TEAM_NAMES':
      return { ...state, showTeamNames: !state.showTeamNames };
    default:
      return state;
  }
}

export const EMPTY_MAP_STATE: MapViewState = {
  nodes: [],
  edges: [],
  teams: [],
  contextMenu: null,
  operatorName: '',
  sidebarCollapsed: false,
  showTeamNames: true,
};

// Haversine distance in km
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

export let teamCounter = 0;
