---
title: Data Model Reference
description: Core FlowDelta types and their role in the pipeline.
---

# Data Model Reference

FlowDelta transforms Salesforce Flow metadata through several normalized types. Understanding these structures is essential for extending the system or debugging diff issues.

## Type hierarchy

```
ParsedFlow (from parser)
    ↓ (build-model.ts)
GraphModel
    ├─ GraphNode[] (normalized)
    └─ GraphEdge[] (with kind: normal | fault)
    
    ↓ (diff-model.ts)
FlowDiff
    ├─ NodeDiff[] (added/deleted/modified/unchanged)
    └─ EdgeDiff[] (added/deleted/unchanged)
```

## GraphModel

The normalized graph representation after parsing and canonicalization.

```typescript
interface GraphModel {
  flowName: string;           // Internal API name (e.g., "MyFlow")
  label: string;              // Display label
  processType?: string;       // Automation type (e.g., "Flow", "CloudFlow")
  nodes: GraphNode[];         // All nodes in the graph
  edges: GraphEdge[];         // All connections
}
```

### GraphNode

A normalized node after canonicalization.

```typescript
interface GraphNode {
  id: string;                 // Unique identifier (the element <name>)
  type: NodeType;             // Element type (decision, assignment, etc.)
  label: string;              // Display label
  properties: Record<string, unknown>;
    // Canonicalized properties (stripped of coordinates, connectors, etc.)
    // See architecture.md for canonicalization rules
}
```

### NodeType (union)

All supported Salesforce Flow element types:

```typescript
type NodeType =
  | "start"           // Flow entry point (synthetic)
  | "end"             // Flow exit point (synthetic)
  | "assignment"      // Assignment element
  | "decision"        // Decision (if/else branch)
  | "loop"            // Loop element
  | "recordLookup"    // SOQL lookup
  | "recordCreate"    // DML create
  | "recordUpdate"    // DML update
  | "recordDelete"    // DML delete
  | "screen"          // Lightning screen
  | "subflow"         // Subflow call
  | "actionCall"      // Action invocation
  | "apexPluginCall"  // Apex plug-in
  | "wait"            // Wait element
  | "step"            // Step (deprecated, treated as action)
  | "orchestratedStage"  // Orchestration stage
  | "transform"       // Transform element
  | "collectionProcessor"  // Collection processor
  | "customError"     // Custom error
  | "recordRollback"  // Rollback
  | "unknown";        // Unmapped or unrecognized type
```

### GraphEdge

A directed edge connecting two nodes.

```typescript
interface GraphEdge {
  id: string;                 // Composite: `${source}->${target}#${kind}#${label}`
  source: string;             // Source node id
  target: string;             // Target node id
  kind: "normal" | "fault";   // Connection type (includes kind in identity)
  label?: string;             // Optional label (outcome name for decisions)
}
```

**Important:** Edge identity includes `kind` (fault vs. normal) because the same two nodes may have multiple edges of different kinds.

## FlowDiff

The semantic diff output, ready for rendering or serialization to JSON.

```typescript
interface FlowDiff {
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
```

### NodeDiff

Classifies a node's change status and attaches property deltas.

```typescript
interface NodeDiff {
  id: string;
  type: NodeType;
  label: string;
  status: "added" | "deleted" | "modified" | "unchanged";
  
  changes?: PropertyChange[];
    // Per-property deltas. Only for "modified".
    // Example: { path: "rules[0].conditions[1].value", before: "x", after: "y" }
  
  before?: Record<string, unknown>;
    // Full property snapshot from the old version (modified only)
    // Renderer uses this for context (faint sibling columns in tables)
  
  after?: Record<string, unknown>;
    // Full property snapshot from the new version (modified only)
}

interface PropertyChange {
  path: string;              // Dot-path to the changed property (array-indexed if needed)
  before: unknown;           // Old value
  after: unknown;            // New value
}
```

### EdgeDiff

Tracks edge changes with minimal data (edges have no internal structure to diff).

```typescript
interface EdgeDiff {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind: "normal" | "fault";
  status: "added" | "deleted" | "unchanged";
}
```

## Canonicalization (build-model.ts)

Before diffing, `GraphNode.properties` are normalized via:

1. **TOP_LEVEL_KEYS removed:**
   - `name`, `label`, `locationX`, `locationY`, `elementSubtype`, `diffStatus`
   - Coordinates are the main noise; removing them ensures no-op saves produce zero diff

2. **EDGE_KEYS removed at all levels:**
   - `connector`, `faultConnector`, `defaultConnector`, `nextValueConnector`, `noMoreValuesConnector`
   - Connectors become `GraphEdge` objects instead

3. **UNORDERED_ARRAY_KEYS sorted stably:**
   - `capabilityTypes`, `choiceReferences`, `dataTypeMappings`, `filters`, `inputParameters`, `outputParameters`, `processMetadataValues`
   - Order-insensitive collections don't produce spurious diffs
   - Array keys NOT in this list are kept positional (e.g., decision rules, assignment items)

## Common property shapes

### Decision (decision nodes)

After canonicalization, a decision has:

```typescript
{
  rules: [
    {
      name: "MyOutcome",
      conditions: [
        {
          leftValueReference: "...",
          operator: "Equals",
          rightValue: { ... }
        }
      ]
    }
  ],
  defaultConnectorLabel: "DefaultOutcome"
}
```

### Assignment (assignment nodes)

```typescript
{
  assignmentItems: [
    {
      assignToReference: "myVar",
      operator: "Assign",
      value: { ... }
    }
  ]
}
```

### Record operations (create, update, lookup, delete)

Record Create/Update typically have:

```typescript
{
  inputAssignments: [
    {
      field: "Phone",
      value: { ... }
    }
  ]
}
```

Record Lookup/Delete typically have:

```typescript
{
  filters: [
    {
      field: "Id",
      operator: "Equals",
      value: { ... }
    }
  ]
}
```

### Typed values

Properties often wrap scalars in type discriminators:

```typescript
{
  stringValue: "hello"
}
// or
{
  booleanValue: "true"
}
// or
{
  numberValue: 42
}
```

The renderer unwraps these for cleaner display in the UI.

## Synthetic nodes

FlowDelta synthesizes two virtual nodes:

- **`start` node** (id: `FLOW_START`, type: `"start"`)
  - Represents the flow entry point
  - Edges from start to the actual start node(s) in the parsed flow

- **`end` node** (id: `END`, type: `"end"`)
  - Synthetic terminal node
  - All leaf edges in the flow target this node for rendering consistency

These ensure the graph is always well-formed (single entry, single exit) even if the source XML has multiple start/end paths.

## deepDiff algorithm

`src/diff/deep-diff.ts` recursively compares two values and returns property changes:

```typescript
interface PropertyChange {
  path: string;     // Dot-notated, array-indexed path
  before: unknown;
  after: unknown;
}

function deepDiff(oldValue: unknown, newValue: unknown): PropertyChange[]
```

Example outputs:

```typescript
// Scalar change
{ path: "rules[0].name", before: "OldName", after: "NewName" }

// Nested object change
{ path: "inputParameters[0].value.stringValue", before: "x", after: "y" }

// Array addition
{ path: "conditions[2]", before: undefined, after: {...} }
```

The diff is **structural** — it recurses into all levels and reports every leaf change. There is no special case for add/remove; those surface as `undefined` → value or value → `undefined`.

## Flow of data through the pipeline

```
Flow XML
  ↓ parser (flow_parser.ts)
ParsedFlow
  { elements: [...], transitions: [...], label, fullName }
  ↓ build-model (buildGraphModel)
GraphModel
  { nodes: [...], edges: [...], label, flowName }
  ↓ diff-model (diffModel)
FlowDiff
  { nodes: [NodeDiff...], edges: [EdgeDiff...], summary: {...} }
  ↓ layout (layoutFlow)
LayoutedFlow (GraphModel + position data)
  ↓ renderHTML (renderHtml)
Self-contained HTML artifact
```

At each stage, the data is read-only for the next stage. Modifications are only additions (position data, diff status, property changes) — never destructive.
