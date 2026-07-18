# Architecture

FlowDelta converts two versions of a Salesforce Flow into a semantic, visual diff.
The pipeline is a straight line:

```
XML (old) ─┐
           ├─► parser ─► GraphModel ─┐
XML (new) ─┘     └─► header ──────────┤─► FlowDiff ─► layout ─► HTML + diff.json
                          (build-model)         (diff-model)  (render)
```

FlexiPageDelta is a sibling pipeline in the same package. It parses
`.flexipage-meta.xml` directly with `xml2js`, builds an ordered `PageModel`
tree, diffs regions/components into a `PageDiff`, and renders an offline
outline with an optional template wireframe. Its detailed invariants and module
map live in [flexipage.md](flexipage.md).

**Core principle:** diff the _normalized model_, not the rendered diagram or the
raw XML. Cosmetic saves (coordinate churn, element reordering) must produce zero
diff; only logic changes should surface.

## Modules (`src/`)

| Module                                          | Responsibility                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parser/flow_parser.ts`, `parser/flow_types.ts` | **Vendored** parser (Apache-2.0). Parses `.flow-meta.xml` into a `ParsedFlow` with typed node collections, a `nameToNode` map, and `transitions` (BFS from start). Do not edit — see [vendoring.md](vendoring.md).                                             |
| `io/read-flow.ts`                               | Reads flow XML from a file path or from a git ref (`git show <ref>:<path>`). Returns `null` when a path is absent at a ref (added/deleted flow).                                                                                                               |
| `model/graph-model.ts`                          | Our normalized types: `GraphNode`, `GraphEdge`, `GraphModel`, `NodeType`. `GraphModel.header` carries curated flow-root attributes when raw XML is available.                                                                                                  |
| `model/flow-header.ts`                          | Thin, non-vendored extractor for selected `<Flow>` root scalars (`status`, `processType`, `runInMode`, `apiVersion`, `triggerOrder`, `description`, `interviewLabel`, `isTemplate`). Parses raw XML with `xml2js` and leaves malformed/headerless XML as `{}`. |
| `model/build-model.ts`                          | `ParsedFlow → GraphModel`. **Canonicalization lives here.**                                                                                                                                                                                                    |
| `diff/deep-diff.ts`                             | Generic recursive `{path, before, after}` diff of two values.                                                                                                                                                                                                  |
| `diff/diff-model.ts`                            | `GraphModel × GraphModel → FlowDiff`. Classifies nodes/edges added/deleted/modified/unchanged, diffs both-present flow headers, and attaches per-property deltas.                                                                                              |
| `render/layout.ts`                              | Deterministic graph layout via `elkjs` (layered, top-down). Positions are computed at build time and baked into the artifact.                                                                                                                                  |
| `render/section-schemas.ts`                     | Type-specific property grouping schemas. Declare how each node type's changes should be organized into semantic sections (e.g., "Outcomes" for decisions) and rendered (lines, table, or grouped-table).                                                       |
| `render/render-html.ts`                         | `LayoutedFlow → self-contained HTML` (inline SVG + vanilla JS pan/zoom + click-for-delta panel + interactive view filters). Uses section schemas to organize property changes semantically. No network/runtime deps. See [render.md](render.md).               |
| `ci/report-core.ts`                             | Product/platform-agnostic reporting core: vocabulary-driven comment rendering, result loading, zero-summary checks, sticky-note helpers, artifact URLs, and path/table utilities. See [ci.md](ci.md) and [flexipage.md](flexipage.md).                                                                        |
| `ci/gitlab-report.ts`                           | Consumes `*.diff.json` (via `report-core`), builds the sticky GitLab MR comment, and upserts it via the GitLab API. See [ci.md](ci.md).                                                                                                                        |
| `ci/github-report.ts`                           | Same shared core, GitHub-shaped: upserts a sticky PR comment via the issue-comments API (marker-only match, no `/user` call). See [ci.md](ci.md).                                                                                                              |
| `cli.ts`                                        | Arg parsing + orchestration for file mode and git mode. See [cli.md](cli.md).                                                                                                                                                                                  |

FlexiPage modules:

| Module | Responsibility |
| --- | --- |
| `io/read-metadata.ts` | Neutral local-file and git-ref XML reader used by the FlexiPage CLI. |
| `flexipage/parse.ts` / `page-model.ts` | XML parser, recursive property normalization, transitive stable facet-path canonicalization, and ordered-tree types. |
| `flexipage/diff-page.ts` | Collision-free canonical-region matching, identifier-aware LCS item matching, breadcrumbs, and header/region metadata diffs. |
| `flexipage/render-outline.ts` / `render/shell.ts` | Offline nested outline, shared artifact shell, filters, theme controls, detail panel, and wireframe rollup/digest client state. |
| `flexipage/render-wireframe.ts` / `template-geometry.ts` | Registry-driven template placement, nested stacks, slot reconciliation, removed/unplaced content handling, and top-level change rollups. |
| `flexipage-cli.ts` | File/git orchestration for `flexipage-delta`. |

Delivery extras:

- `scripts/build.mjs` emits the published `dist/cli.js`, `dist/gitlab-report.js`,
  `dist/github-report.js`, `dist/flexipage-cli.js`,
  `dist/flexipage-gitlab-report.js`, and `dist/flexipage-github-report.js`
  entrypoints.
- `examples/gitlab-ci.yml` and `examples/github-actions.yml` are the documented
  job/workflow recipes for MR and PR pipelines, respectively.
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

### 4. Flow-level header attributes are diffed separately

The vendored parser intentionally stays untouched. It parses many Flow-root
fields, but `build-model.ts` operates on the parser's element graph and should
stay focused on nodes and edges. The CLI already has raw XML in hand, so it
attaches `GraphModel.header` by calling `extractFlowHeader(xml)` after model
building.

Only a curated scalar set is compared: `status`, `processType`, `runInMode`,
`apiVersion`, `triggerOrder`, `description`, `interviewLabel`, and `isTemplate`.
These changes appear in `FlowDiff.flowChanges` and increment
`summary.changedFlowAttributes`. If one side has no header (whole-flow add/delete),
header diffing is skipped because the node-level add/delete already carries the
headline signal.

### 5. Per-property deltas are generic

`deepDiff` recurses structurally and reports each changed leaf as
`{path, before, after}` (e.g. `rules[0].conditions[1]`). There is no per-node-type
mapping; it is uniform across all element types.

### 6. The artifact is offline-safe

`render-html.ts` emits a single HTML file with inline SVG, CSS, and JS — **no**
external URLs (asserted in tests). Layout is precomputed; the browser only needs
to pan/zoom and populate the side panel.

## Known scope boundaries

- Only the curated flow-level scalar set listed above is diffed. Noisy or
  structural root collections such as `processMetadataValues`, `variables`,
  `formulas`, choices, stages, and `startElementReference` remain out of scope.
- Flow-level headers are not rendered for whole-flow adds/deletes; the graph-level
  add/delete is the reviewed signal in those cases.
- No subflow traversal (subflows are opaque nodes), no rename detection.

Rationale and roadmap: the work items `fl-semantic-diff-render-mvp` and
`fl-gitlab-ci-mr-comment`, plus the topic docs in `docs/`.
