import type { FlowHeader } from "./flow-header.ts";

export type NodeType =
  | "start"
  | "end"
  | "assignment"
  | "decision"
  | "loop"
  | "recordLookup"
  | "recordCreate"
  | "recordUpdate"
  | "recordDelete"
  | "screen"
  | "subflow"
  | "actionCall"
  | "apexPluginCall"
  | "wait"
  | "step"
  | "orchestratedStage"
  | "transform"
  | "collectionProcessor"
  | "customError"
  | "recordRollback"
  | "unknown";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "normal" | "fault";
  label?: string;
}

export interface GraphModel {
  flowName: string;
  label: string;
  processType?: string;
  header?: FlowHeader;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
