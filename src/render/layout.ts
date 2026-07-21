import ELK from "elkjs/lib/elk.bundled.js";
import type { FlowDiff, EdgeDiff, NodeDiff } from "../diff/diff-model.ts";

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutSection {
  startPoint: LayoutPoint;
  endPoint: LayoutPoint;
  bendPoints?: LayoutPoint[];
}

export interface LayoutNodeGeometry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdgeGeometry {
  id: string;
  sections: LayoutSection[];
}

export interface LayoutedNode extends NodeDiff {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutedEdge extends EdgeDiff {
  sections: LayoutSection[];
}

export interface LayoutedFlow {
  diff: FlowDiff;
  nodes: LayoutedNode[];
  edges: LayoutedEdge[];
  width: number;
  height: number;
  views: {
    union: LayoutView;
    after: LayoutView;
    before: LayoutView;
  };
}

export interface LayoutView {
  nodes: LayoutNodeGeometry[];
  edges: LayoutEdgeGeometry[];
  width: number;
  height: number;
}

export async function layoutDiff(diff: FlowDiff): Promise<LayoutedFlow> {
  const union = await layoutView(diff, () => true, () => true);
  const after = await layoutView(
    diff,
    (node) => node.status !== "deleted",
    (edge) => edge.status !== "deleted",
  );
  const before = await layoutView(
    diff,
    (node) => node.status !== "added",
    (edge) => edge.status !== "added",
  );
  const unionNodeGeometry = new Map(union.nodes.map((node) => [node.id, node]));
  const unionEdgeGeometry = new Map(union.edges.map((edge) => [edge.id, edge]));

  return {
    diff,
    nodes: diff.nodes.map((node) => withNodeGeometry(node, unionNodeGeometry.get(node.id))),
    edges: diff.edges.map((edge) => withEdgeGeometry(edge, unionEdgeGeometry.get(edge.id))),
    width: union.width,
    height: union.height,
    views: {
      union,
      after,
      before,
    },
  };
}

const elk = new ELK.default();

async function layoutView(
  diff: FlowDiff,
  nodeVisible: (node: NodeDiff) => boolean,
  edgeVisible: (edge: EdgeDiff) => boolean,
): Promise<LayoutView> {
  const nodes = diff.nodes.filter(nodeVisible);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = diff.edges.filter((edge) => edgeVisible(edge) && nodeIds.has(edge.source) && nodeIds.has(edge.target));

  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 40, height: 40 };
  }

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
      "elk.spacing.nodeNode": "40",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: estimateWidth(node.label),
      height: 48,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const laidOut = await elk.layout(graph);
  const children = (laidOut.children ?? []) as Array<{ id: string; x?: number; y?: number; width: number; height: number }>;
  const edgeLayouts = (laidOut.edges ?? []) as Array<{ id: string; sections?: LayoutSection[] }>;
  const nodeMap = new Map(children.map((node) => [node.id, node]));
  const edgeMap = new Map(edgeLayouts.map((edge) => [edge.id, edge]));

  const positionedNodes = nodes.map((node) => {
    const positioned = nodeMap.get(node.id);
    return {
      id: node.id,
      x: positioned?.x ?? 0,
      y: positioned?.y ?? 0,
      width: positioned?.width ?? estimateWidth(node.label),
      height: positioned?.height ?? 48,
    };
  });

  const positionedEdges = edges.map((edge) => ({
    id: edge.id,
    sections: normalizeSections(edgeMap.get(edge.id)?.sections),
  }));

  const bounds = measureBounds(positionedNodes);
  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    width: bounds.width,
    height: bounds.height,
  };
}

function estimateWidth(label: string): number {
  return Math.max(120, Math.min(320, label.length * 8 + 32));
}

function normalizeSections(sections: LayoutSection[] | undefined): LayoutSection[] {
  if (!sections || sections.length === 0) {
    return [];
  }
  return sections.map((section) => ({
    startPoint: { x: section.startPoint.x, y: section.startPoint.y },
    endPoint: { x: section.endPoint.x, y: section.endPoint.y },
    bendPoints: section.bendPoints?.map((point) => ({ x: point.x, y: point.y })),
  }));
}

function measureBounds(nodes: LayoutNodeGeometry[]): { width: number; height: number } {
  const maxX = nodes.reduce((acc, node) => Math.max(acc, node.x + node.width), 0);
  const maxY = nodes.reduce((acc, node) => Math.max(acc, node.y + node.height), 0);
  return { width: maxX + 40, height: maxY + 40 };
}

function withNodeGeometry(node: NodeDiff, geometry: LayoutNodeGeometry | undefined): LayoutedNode {
  return {
    ...node,
    x: geometry?.x ?? 0,
    y: geometry?.y ?? 0,
    width: geometry?.width ?? estimateWidth(node.label),
    height: geometry?.height ?? 48,
  };
}

function withEdgeGeometry(edge: EdgeDiff, geometry: LayoutEdgeGeometry | undefined): LayoutedEdge {
  return {
    ...edge,
    sections: geometry?.sections ?? [],
  };
}
