import type { NodeDiff } from "../diff/diff-model.ts";
import type { NodeType } from "../model/graph-model.ts";
import { changeSummary, nodeSummary } from "../model/node-summary.ts";

export function nodeDisplayLabel(node: { type: NodeType; label: string }): string {
  return node.type === "start" && node.label === "FLOW_START" ? "Start" : node.label;
}

export function nodeCaption(node: NodeDiff): string {
  if (node.summary !== undefined) return node.summary;
  if (node.status === "modified") return changeSummary(node);
  return nodeSummary(node.type, node.after ?? node.before ?? {});
}
