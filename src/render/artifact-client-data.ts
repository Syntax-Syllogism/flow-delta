import type { EdgeDiff, NodeDiff } from "../diff/diff-model.ts";
import { getSectionSchemas } from "./section-schemas.ts";
import type { LayoutEdgeGeometry, LayoutNodeGeometry, LayoutView, LayoutedFlow } from "./layout.ts";
import { renderNodePanelBody } from "./snapshot-panel.ts";

export interface FlowArtifactClientNode {
  id: NodeDiff["id"];
  label: NodeDiff["label"];
  status: NodeDiff["status"];
  detailHtml: string;
}

export interface FlowArtifactClientEdge {
  id: EdgeDiff["id"];
  source: EdgeDiff["source"];
  target: EdgeDiff["target"];
  status: EdgeDiff["status"];
}

export interface FlowArtifactClientView {
  nodes: LayoutNodeGeometry[];
  edges: LayoutEdgeGeometry[];
  width: number;
  height: number;
}

export interface FlowArtifactClientData {
  nodes: FlowArtifactClientNode[];
  edges: FlowArtifactClientEdge[];
  layouts: {
    union: FlowArtifactClientView;
    after: FlowArtifactClientView;
    before: FlowArtifactClientView;
  };
}

export function buildFlowArtifactClientData(layout: LayoutedFlow): FlowArtifactClientData {
  return {
    nodes: layout.diff.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      status: node.status,
      detailHtml: renderNodePanelBody(node, getSectionSchemas(node.type)),
    })),
    edges: layout.diff.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      status: edge.status,
    })),
    layouts: {
      union: toClientView(layout.views.union),
      after: toClientView(layout.views.after),
      before: toClientView(layout.views.before),
    },
  };
}

function toClientView(view: LayoutView): FlowArtifactClientView {
  return {
    nodes: view.nodes,
    edges: view.edges,
    width: view.width,
    height: view.height,
  };
}
