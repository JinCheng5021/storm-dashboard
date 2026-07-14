import type { NodeFeature, EdgeFeature } from '../types';

type GeoJSONCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: {
      type: string;
      coordinates: unknown;
    };
  }>;
};

export function parseGeoJSON(raw: GeoJSONCollection): {
  nodes: NodeFeature[];
  edges: EdgeFeature[];
} {
  const nodes: NodeFeature[] = [];
  const edges: EdgeFeature[] = [];
  const nodeNameSet = new Set<string>();

  // First pass: extract Point features as nodes
  for (const feature of raw.features) {
    if (feature.geometry.type === 'Point') {
      const coords = feature.geometry.coordinates as [number, number];
      const name = String(feature.properties.name ?? 'Unknown');
      if (!nodeNameSet.has(name)) {
        nodeNameSet.add(name);
        nodes.push({
          id: `node_${name}`,
          name,
          coordinates: [coords[0], coords[1]],
          status: 'active',
        });
      }
    }
  }

  // Second pass: extract LineString features as edges
  for (const feature of raw.features) {
    if (feature.geometry.type === 'LineString') {
      const rawCoords = feature.geometry.coordinates as number[][];
      const coords: [number, number][] = rawCoords.map((c) => [c[0], c[1]]);
      const id = String(feature.properties.id ?? `edge_${edges.length}`);
      const name = String(feature.properties.name ?? id);
      edges.push({
        id,
        name,
        coordinates: coords,
        status: 'normal',
      });
    }
  }

  return { nodes, edges };
}
