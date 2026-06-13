# Architecture

FlowDelta converts two versions of a Salesforce Flow into a semantic, visual diff.
The pipeline is a straight line:

```
XML (old) ─┐
           ├─► parser ─► GraphModel ─┐
XML (new) ─┘                          ├─► FlowDiff ─► layout ─► HTML + diff.json
                          (build-model)         (diff-model)  (render)
```

**Core principle:** diff the *normalized model*, not the rendered diagram or the
raw XML. Cosmetic saves (coordinate churn, element reordering) must produce zero
diff; only logic changes should surface.

## Modules (`src/`)

| Module | Responsibility |
|--------|----------------|
| `parser/flow_parser.ts`, `parser/flow_types.ts` | **Vendored** parser (Apache-2.0). Parses `.flow-meta.xml` into a `ParsedFlow` with typed node collections, a `nameToNode` map, and `transitions` (BFS from start). Do not edit — see [vendoring.md](vendoring.md). |
| `io/read-flow.ts` | Reads flow XML from a file path or from a git ref (`git show <ref>:<path>`). Returns `null` when a path is absent at a ref (added/deleted flow). |
| `model/graph-model.ts` | Our normalized types: `GraphNode`, `GraphEdge`, `GraphModel`, `NodeType`. |
| `model/build-model.ts` | `ParsedFlow → GraphModel`. **Canonicalization lives here.** |
| `diff/deep-diff.ts` | Generic recursive `{path, before, after}` diff of two values. |
| `diff/diff-model.ts` | `GraphModel × GraphModel → FlowDiff`. Classifies nodes/edges added/deleted/modified/unchanged and attaches per-property deltas. |
| `render/layout.ts` | Deterministic graph layout via `elkjs` (layered, top-down). Positions are computed at build time and baked into the artifact. |
| `render/render-html.ts` | `LayoutedFlow → self-contained HTML` (inline SVG + vanilla JS pan/zoom + click-for-delta panel + interactive view filters). No network/runtime deps. See [render.md](render.md). |
| `ci/gitlab-report.ts` | Consumes `*.diff.json`, builds the sticky GitLab MR comment, and upserts it via the GitLab API. See [ci.md](ci.md). |
| `cli.ts` | Arg parsing + orchestration for file mode and git mode. See [cli.md](cli.md). |

Delivery extras:

- `scripts/build.mjs` emits the published `dist/cli.js` and `dist/gitlab-report.js`
  entrypoints.
- `examples/gitlab-ci.yml` is the documented GitLab job recipe for MR pipelines.
- [`publishing.md`](publishing.md) covers the npm package shape and release checks.

## Invariants that must hold

These are the load-bearing rules. Changing them changes the product's behavior;
they are covered by tests in `test/semantic-diff.test.ts`.

### 1. Node identity is the Flow element `<name>`
Nodes are matched between versions by `name` (the stable API name), not by
position. A renamed element therefore reads as delete + add (rename detection is
out of scope). `build-model` synthesizes a `start` node (`FLOW_START`) and a
single `END` node so terminal edges have a target.

### 2. Canonicalization (in `build-model.ts`)
A node's diff-able `properties` are produced by `structuredClone` + a strip pass:

- **`TOP_LEVEL_KEYS`** removed from the node root: `name`, `label`, `locationX`,
  `locationY`, `elementSubtype`, `diffStatus`. (Coordinates are the main cosmetic
  noise; stripping them is the headline "no-op save = zero diff" guarantee.)
- **`EDGE_KEYS`** removed at every level: `connector`, `faultConnector`,
  `defaultConnector`, `nextValueConnector`, `noMoreValuesConnector`. Connectors
  are represented as graph **edges**, not node properties.
- **`UNORDERED_ARRAY_KEYS`** are sorted (stable stringify) so order-insensitive
  collections don't read as changes: `capabilityTypes`, `choiceReferences`,
  `dataTypeMappings`, `filters`, `inputParameters`, `outputParameters`,
  `processMetadataValues`. This is an **allowlist** — order-sensitive arrays
  (decision `rules`, `assignmentItems`, `conditions`) stay positional. If a real
  no-op save shows a spurious `modified` on a reordered array, add its key here.

### 3. Edges carry `kind` in their identity
Edge id = `` `${from}->${to}#${kind}#${label}` `` where `kind` is `fault` or
`normal`. Without `kind` in the id, a fault connector and a normal connector
between the same two nodes would collide and one would be lost.

### 4. Per-property deltas are generic
`deepDiff` recurses structurally and reports each changed leaf as
`{path, before, after}` (e.g. `rules[0].conditions[1]`). There is no per-node-type
mapping; it is uniform across all element types.

### 5. The artifact is offline-safe
`render-html.ts` emits a single HTML file with inline SVG, CSS, and JS — **no**
external URLs (asserted in tests). Layout is precomputed; the browser only needs
to pan/zoom and populate the side panel.

## Known scope boundaries

- **Flow-level attributes are not diffed.** Only the node/edge graph is compared.
  `<status>` (Active/Draft), canvas mode, `processMetadataValues`, and similar
  flow-root metadata are dropped in `build-model` and never reach the diff. (A
  flow being deactivated is currently invisible — a deliberate open question.)
- No subflow traversal (subflows are opaque nodes), no rename detection.

Rationale and roadmap: the work items `fl-semantic-diff-render-mvp` and
`fl-gitlab-ci-mr-comment`, plus the topic docs in `docs/`.
