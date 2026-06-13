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
}

export async function layoutDiff(diff: FlowDiff): Promise<LayoutedFlow> {
  const elk = new ELK();
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": 60,
      "elk.spacing.nodeNode": 40,
    },
    children: diff.nodes.map((node) => ({
      id: node.id,
      width: estimateWidth(node.label),
      height: 48,
    })),
    edges: diff.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const laidOut = await elk.layout(graph);
  const children = (laidOut.children ?? []) as Array<{ id: string; x?: number; y?: number; width: number; height: number }>;
  const edges = (laidOut.edges ?? []) as Array<{ id: string; sections?: LayoutSection[] }>;
  const nodeMap = new Map(children.map((node) => [node.id, node]));
  const edgeMap = new Map(edges.map((edge) => [edge.id, edge]));

  const nodes = diff.nodes.map((node) => {
    const positioned = nodeMap.get(node.id);
    return {
      ...node,
      x: positioned?.x ?? 0,
      y: positioned?.y ?? 0,
      width: positioned?.width ?? estimateWidth(node.label),
      height: positioned?.height ?? 48,
    };
  });

  const positionedEdges = diff.edges.map((edge) => ({
    ...edge,
    sections: normalizeSections(edgeMap.get(edge.id)?.sections),
  }));

  const bounds = measureBounds(nodes);
  return {
    diff,
    nodes,
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

function measureBounds(nodes: LayoutedNode[]): { width: number; height: number } {
  const maxX = nodes.reduce((acc, node) => Math.max(acc, node.x + node.width), 0);
  const maxY = nodes.reduce((acc, node) => Math.max(acc, node.y + node.height), 0);
  return { width: maxX + 40, height: maxY + 40 };
}
