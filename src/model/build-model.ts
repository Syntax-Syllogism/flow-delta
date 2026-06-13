import type { ParsedFlow, Transition } from "../parser/flow_parser.ts";
import type * as flowTypes from "../parser/flow_types.ts";
import type { GraphEdge, GraphModel, GraphNode, NodeType } from "./graph-model.ts";

const EDGE_KEYS = new Set([
  "connector",
  "faultConnector",
  "defaultConnector",
  "nextValueConnector",
  "noMoreValuesConnector",
]);

const TOP_LEVEL_KEYS = new Set([
  "name",
  "label",
  "locationX",
  "locationY",
  "elementSubtype",
  "diffStatus",
]);

const UNORDERED_ARRAY_KEYS = new Set([
  "capabilityTypes",
  "choiceReferences",
  "dataTypeMappings",
  "filters",
  "inputParameters",
  "outputParameters",
  "processMetadataValues",
]);

const NODE_TYPE_BY_COLLECTION: Record<string, NodeType> = {
  apexPluginCalls: "apexPluginCall",
  assignments: "assignment",
  collectionProcessors: "collectionProcessor",
  customErrors: "customError",
  decisions: "decision",
  loops: "loop",
  orchestratedStages: "orchestratedStage",
  recordCreates: "recordCreate",
  recordDeletes: "recordDelete",
  recordLookups: "recordLookup",
  recordRollbacks: "recordRollback",
  recordUpdates: "recordUpdate",
  screens: "screen",
  steps: "step",
  subflows: "subflow",
  transforms: "transform",
  waits: "wait",
  actionCalls: "actionCall",
};

export function buildModel(parsed: ParsedFlow): GraphModel {
  const nodes = [
    toNode(parsed.start, "start"),
    toNode({ name: "END", label: "End", description: "End", elementSubtype: "End", locationX: 0, locationY: 0 } as flowTypes.FlowNode, "end"),
    ...collectNodes(parsed),
  ]
    .filter((node): node is GraphNode => Boolean(node))
    .sort((a, b) => a.id.localeCompare(b.id));

  const edges = addImplicitEndTransitions(parsed.transitions ?? [], parsed.start?.name)
    .map(toEdge)
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    flowName: parsed.fullName ?? parsed.label ?? "(unknown)",
    label: parsed.label ?? parsed.fullName ?? "(unknown)",
    processType: parsed.processType,
    nodes,
    edges,
  };
}

export function emptyModel(flowName = "(unknown)", label = "(unknown)"): GraphModel {
  return { flowName, label, nodes: [], edges: [] };
}

function addImplicitEndTransitions(transitions: Transition[], startNodeId?: string): Transition[] {
  const reachableNodeIds = new Set([
    ...(startNodeId ? [startNodeId] : []),
    ...transitions.flatMap((transition) => [transition.from, transition.to]),
  ]);
  const nodesWithNormalExit = new Set(
    transitions
      .filter((transition) => !transition.fault)
      .map((transition) => transition.from),
  );
  const implicitEndTransitions = [...reachableNodeIds]
    .filter((nodeId) => nodeId !== "END" && !nodesWithNormalExit.has(nodeId))
    .map((nodeId) => ({ from: nodeId, to: "END", fault: false }));

  return [...transitions, ...implicitEndTransitions];
}

function collectNodes(parsed: ParsedFlow): GraphNode[] {
  const result: GraphNode[] = [];
  for (const [collectionName, type] of Object.entries(NODE_TYPE_BY_COLLECTION)) {
    const nodes = parsed[collectionName as keyof ParsedFlow] as flowTypes.FlowNode[] | undefined;
    if (!nodes) {
      continue;
    }
    for (const node of nodes) {
      result.push(toNode(node, type));
    }
  }
  return result;
}

function toNode(node: flowTypes.FlowNode | undefined, type: NodeType): GraphNode | undefined {
  if (!node) {
    return undefined;
  }
  const label = "label" in node && typeof node.label === "string" ? node.label : node.name;
  return {
    id: node.name,
    type,
    label,
    properties: stripNodeProperties(structuredClone(node), true) as Record<string, unknown>,
  };
}

function toEdge(transition: Transition): GraphEdge {
  const label = transition.label;
  return {
    id: `${transition.from}->${transition.to}#${transition.fault ? "fault" : "normal"}#${label ?? ""}`,
    source: transition.from,
    target: transition.to,
    kind: transition.fault ? "fault" : "normal",
    label,
  };
}

function stripNodeProperties(value: unknown, topLevel = false): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripNodeProperties(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (topLevel && TOP_LEVEL_KEYS.has(key)) {
      continue;
    }
    if (EDGE_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(entry) && UNORDERED_ARRAY_KEYS.has(key)) {
      result[key] = normalizeUnorderedArray(entry);
      continue;
    }
    result[key] = stripNodeProperties(entry);
  }
  return result;
}

function normalizeUnorderedArray(items: unknown[]): unknown[] {
  return items
    .map((item) => stripNodeProperties(item))
    .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.keys(entry as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (entry as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return entry;
  }) ?? "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
