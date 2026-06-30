import type { GraphEdge, GraphModel, GraphNode, NodeType } from "../model/graph-model.ts";
import { deepDiff, type PropertyChange } from "./deep-diff.ts";

export type Status = "added" | "deleted" | "modified" | "unchanged";

export interface NodeDiff {
  id: string;
  type: NodeType;
  label: string;
  status: Status;
  changes?: PropertyChange[];
  /**
   * Raw property snapshots for changed nodes. Modified nodes carry both
   * snapshots; added nodes carry after; deleted nodes carry before.
   * `changes` remains modified-only.
   */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface EdgeDiff {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind: "normal" | "fault";
  status: "added" | "deleted" | "unchanged";
}

export interface FlowDiff {
  flowName: string;
  summary: {
    addedNodes: number;
    removedNodes: number;
    modifiedNodes: number;
    unchangedNodes: number;
    addedEdges: number;
    removedEdges: number;
  };
  nodes: NodeDiff[];
  edges: EdgeDiff[];
}

export function diffModel(oldModel: GraphModel, newModel: GraphModel): FlowDiff {
  const oldNodes = indexById(oldModel.nodes);
  const newNodes = indexById(newModel.nodes);
  const oldEdges = indexById(oldModel.edges);
  const newEdges = indexById(newModel.edges);

  const nodeIds = [...new Set([...oldNodes.keys(), ...newNodes.keys()])].sort();
  const edgeIds = [...new Set([...oldEdges.keys(), ...newEdges.keys()])].sort();

  const nodes = nodeIds.map((id) => classifyNode(oldNodes.get(id), newNodes.get(id)));
  const edges = edgeIds.map((id) => classifyEdge(oldEdges.get(id), newEdges.get(id)));

  const summary = {
    addedNodes: nodes.filter((node) => node.status === "added").length,
    removedNodes: nodes.filter((node) => node.status === "deleted").length,
    modifiedNodes: nodes.filter((node) => node.status === "modified").length,
    unchangedNodes: nodes.filter((node) => node.status === "unchanged").length,
    addedEdges: edges.filter((edge) => edge.status === "added").length,
    removedEdges: edges.filter((edge) => edge.status === "deleted").length,
  };

  return {
    flowName: selectFlowName(oldModel, newModel),
    summary,
    nodes,
    edges,
  };
}

function selectFlowName(oldModel: GraphModel, newModel: GraphModel): string {
  if (newModel.nodes.length > 0 || newModel.edges.length > 0) {
    return newModel.flowName;
  }
  return oldModel.flowName;
}

function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function classifyNode(oldNode: GraphNode | undefined, newNode: GraphNode | undefined): NodeDiff {
  if (!oldNode && !newNode) {
    throw new Error("Cannot classify absent node");
  }
  if (!oldNode) {
    return { id: newNode!.id, type: newNode!.type, label: newNode!.label, status: "added", after: newNode!.properties };
  }
  if (!newNode) {
    return { id: oldNode.id, type: oldNode.type, label: oldNode.label, status: "deleted", before: oldNode.properties };
  }

  const changes = [
    ...deepDiff(oldNode.label, newNode.label, "label"),
    ...deepDiff(oldNode.type, newNode.type, "type"),
    ...deepDiff(oldNode.properties, newNode.properties),
  ];

  if (changes.length === 0) {
    return {
      id: newNode.id,
      type: newNode.type,
      label: newNode.label,
      status: "unchanged",
    };
  }

  return {
    id: newNode.id,
    type: newNode.type,
    label: newNode.label,
    status: "modified",
    changes,
    before: oldNode.properties,
    after: newNode.properties,
  };
}

function classifyEdge(oldEdge: GraphEdge | undefined, newEdge: GraphEdge | undefined): EdgeDiff {
  if (!oldEdge && !newEdge) {
    throw new Error("Cannot classify absent edge");
  }
  if (!oldEdge) {
    return toEdgeDiff(newEdge!, "added");
  }
  if (!newEdge) {
    return toEdgeDiff(oldEdge, "deleted");
  }
  return toEdgeDiff(newEdge, "unchanged");
}

function toEdgeDiff(edge: GraphEdge, status: EdgeDiff["status"]): EdgeDiff {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    kind: edge.kind,
    status,
  };
}
