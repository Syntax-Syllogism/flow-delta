---
title: Architecture
description: FlowDelta pipeline, module responsibilities, and invariants.
---

# Architecture

FlowDelta turns Salesforce Flow metadata into a semantic visual diff or an as-built snapshot. The pipeline is a straight line:

```
XML (old) ─┐
           ├─► parser ─► GraphModel ─┐
XML (new) ─┘     └─► header ──────────┤─► FlowDiff ─► layout ─► HTML + optional diff.json
                          (build-model)         (diff-model)  (render)
```

Snapshot mode takes one XML input through the same model, layout, and HTML steps. `buildSnapshotDiff` produces the present nodes and edges before rendering.

FlexiPageDelta is a sibling pipeline in the same package. It parses `.flexipage-meta.xml` with `xml2js`, builds an ordered `PageModel` tree, diffs regions and components into a `PageDiff`, and renders an offline outline with an optional template wireframe. Its module map and invariants are in [flexipage.md](flexipage.md).

**The core principle:** work on the _normalized model_, never the rendered diagram or the raw XML. A cosmetic save (moved coordinates, reordered elements) must produce zero diff. Comparison mode shows logic changes, and snapshot mode keeps the current normalized state.

## Modules (`src/`)

| Module | What it does |
| --- | --- |
| `parser/flow_parser.ts`, `parser/flow_types.ts` | **Vendored** parser (Apache-2.0). Turns `.flow-meta.xml` into a `ParsedFlow` with typed node collections, a `nameToNode` map, and `transitions` (BFS from start). Don't edit. See [vendoring.md](vendoring.md). |
| `io/read-metadata.ts` | Synchronous XML reader for local paths and Git refs. Returns `null` when a path is absent at a ref (added or deleted metadata). See [metadata-io.md](metadata-io.md). |
| `io/git.ts` | Injectable `GitRunner`, the default `execFileSync("git", ...)` adapter, and missing-at-ref error classification. See [metadata-io.md](metadata-io.md). |
| `io/discover-git-metadata.ts` | Shared Git discovery (full-tree or changed-only), separator normalization, literal and glob matching, and sorted, de-duplicated output. See [metadata-io.md](metadata-io.md). |
| `io/read-flow-from-org.ts` | Lists Flow versions through the Salesforce CLI Tooling API and retrieves chosen historical versions as metadata XML through one temporary project scaffold. Never handles credentials. |
| `model/graph-model.ts` | Our normalized types: `GraphNode`, `GraphEdge`, `GraphModel`, `NodeType`. `GraphModel.header` holds curated flow-root attributes when raw XML is available. |
| `model/flow-header.ts` | A thin, non-vendored extractor for selected `<Flow>` root scalars: `status`, `processType`, `runInMode`, `apiVersion`, `triggerOrder`, `description`, `interviewLabel`, `isTemplate`. Parses raw XML with `xml2js`. Malformed or headerless XML gives `{}`. |
| `model/build-model.ts` | `ParsedFlow → GraphModel`. **Canonicalization lives here.** |
| `diff/deep-diff.ts` | Generic recursive `{path, before, after}` diff of two values. |
| `diff/diff-model.ts` | `GraphModel × GraphModel → FlowDiff`, plus `buildSnapshotDiff` for one-model snapshots with present nodes and edges and provenance metadata. |
| `render/layout.ts` | Deterministic layered, top-down layout with `elkjs`. Positions are computed at build time and baked into the artifact. |
| `render/section-schemas.ts` | Per-node-type schemas that group property changes into semantic sections (such as "Outcomes" for decisions) and say how to render them: lines, table, or grouped table. |
| `render/render-html.ts` | The Flow SVG canvas and semantic detail content, handed to the shared shell. Embeds a compact client DTO with pre-rendered detail HTML and geometry-only layouts, and uses section schemas while rendering. No network or runtime dependencies. See [render.md](render.md). |
| `ci/report-core.ts` | Reporting core shared by both products and platforms: vocabulary-driven comment rendering, result loading, zero-summary checks, sticky-note helpers, artifact URLs, and path and table utilities. See [ci.md](ci.md) and [flexipage.md](flexipage.md). |
| `ci/gitlab-report.ts` | Reads `*.diff.json` (through `report-core`), builds the sticky GitLab MR comment, and upserts it through the GitLab API. See [ci.md](ci.md). |
| `ci/github-report.ts` | The same core, shaped for GitHub. Upserts a sticky PR comment through the issue-comments API, matching on the marker only (no `/user` call). See [ci.md](ci.md). |
| `cli.ts` | Argument parsing and orchestration for file, git, Salesforce org, and as-built modes. See [cli.md](cli.md). |

FlexiPage modules:

| Module | What it does |
| --- | --- |
| `flexipage/parse.ts` | XML adapter that builds a raw `PageModel` and applies canonicalization. |
| `flexipage/canonicalize-page.ts` | Pure transformation: stable facet-path canonicalization (transitive), GUID-free identity, and unique region names. |
| `flexipage/page-model.ts` | Ordered-tree types for page headers, regions, items, and recursive property values. |
| `flexipage/diff-page.ts` | Collision-free canonical-region matching, identifier-aware LCS item matching, breadcrumbs, and header and region metadata diffs. |
| `flexipage/component-schemas.ts` | Hand-curated component-name registry that turns high-signal property changes into labeled groups, with humanized and generic fallbacks. |
| `flexipage/render-outline.ts`, `render/render-html.ts`, `render/shell.ts` | The two renderers supply product-specific canvases and client state to one offline artifact shell. The shell owns filters, theme controls, panel chrome, and wireframe view switching. FlexiPage schema enrichment is presentation-only and stays out of `PageDiff` and `diff.json`. |
| `flexipage/render-wireframe.ts`, `template-geometry.ts` | Registry-driven template placement, nested stacks, slot reconciliation, handling of removed and unplaced content, and top-level change rollups. |
| `flexipage-cli.ts` | File and git orchestration for `flexipage-delta`. |

Delivery extras:

- `scripts/build.mjs` emits the published entrypoints: `dist/cli.js`, `dist/gitlab-report.js`, `dist/github-report.js`, `dist/flexipage-cli.js`, `dist/flexipage-gitlab-report.js`, and `dist/flexipage-github-report.js`.
- `examples/gitlab-ci.yml` and `examples/github-actions.yml` are the documented recipes for MR and PR pipelines.
- [`publishing.md`](publishing.md) covers the npm package shape and release checks.

## Shared artifact shell

`src/render/shell.ts` is the single source of truth for the document chrome both products use. It owns:

- the doctype;
- the inline theme bootstrap and its persistence (`flow-delta-theme`);
- the four filter controls and their `flowdelta:view-mode` event contract;
- the collapsible, resizable detail panel;
- the optional Outline/Wireframe preference (`flow-delta-view`).

It contains no Flow- or FlexiPage-specific canvas logic. `src/render/render-html.ts` supplies the Flow SVG, the graph interaction client, the semantic panel content, the flow-level banner, and Flow-specific styles. The FlexiPage outline renderer supplies its outline and wireframe content and its own semantic panel client. Both share one offline shell and keep independent canvas behavior.

## Invariants that must hold

These rules carry the product's behavior. Changing one changes what FlowDelta does. `test/semantic-diff.test.ts` covers them.

### 1. Node identity is the Flow element `<name>`

Nodes match across versions by `name`, the stable API name, not by position. A renamed element therefore reads as a delete plus an add. Rename detection is out of scope. `build-model` synthesizes a `start` node (`FLOW_START`) and a single `END` node so terminal edges have a target.

### 2. Canonicalization (in `build-model.ts`)

A node's diff-able `properties` come from a `structuredClone` followed by a strip pass:

- **`TOP_LEVEL_KEYS`** are removed from the node root: `name`, `label`, `locationX`, `locationY`, `elementSubtype`, `diffStatus`. Coordinates are the main cosmetic noise, and stripping them is what makes a no-op save produce zero diff.
- **`EDGE_KEYS`** are removed at every level: `connector`, `faultConnector`, `defaultConnector`, `nextValueConnector`, `noMoreValuesConnector`. Connectors are graph **edges**, not node properties.
- **`UNORDERED_ARRAY_KEYS`** are sorted with a stable stringify, so order-insensitive collections don't read as changes: `capabilityTypes`, `choiceReferences`, `dataTypeMappings`, `filters`, `inputParameters`, `outputParameters`, `processMetadataValues`. This is an **allowlist**. Order-sensitive arrays (decision `rules`, `assignmentItems`, `conditions`) stay positional. If a real no-op save shows a spurious `modified` on a reordered array, add its key here.

### 3. Edge identity includes `kind`

An edge id is `` `${from}->${to}#${kind}#${label}` ``, where `kind` is `fault` or `normal`. Without `kind`, a fault connector and a normal connector between the same two nodes would collide, and one would be lost.

### 4. Flow-level header attributes are diffed separately

The vendored parser stays untouched. It parses many Flow-root fields, but `build-model.ts` works on the parser's element graph and stays focused on nodes and edges. The CLI already has the raw XML, so it attaches `GraphModel.header` by calling `extractFlowHeader(xml)` after the model is built.

Only a curated set of scalars is compared: `status`, `processType`, `runInMode`, `apiVersion`, `triggerOrder`, `description`, `interviewLabel`, and `isTemplate`. Changes show up in `FlowDiff.flowChanges` and increase `summary.changedFlowAttributes`. If one side has no header (the whole flow was added or deleted), header diffing is skipped, because the node-level add or delete already carries the signal.

### 5. Per-property deltas are generic

`deepDiff` recurses through the structure and reports each changed leaf as `{path, before, after}`, for example `rules[0].conditions[1]`. There's no per-node-type mapping. It works the same on every element type.

### 6. The artifact is offline-safe

`render-html.ts` emits one HTML file with inline SVG, CSS, and JS, and **no** external URLs (a test asserts this). Layout is precomputed. The browser only pans, zooms, and fills the side panel.

The HTML embeds a client-oriented DTO, not the full `FlowDiff`: node and edge status and identity, server-rendered node detail HTML, and baked geometry for the `union`, `after`, and `before` views. The optional neighboring `*.diff.json` is the full, machine-readable `FlowDiff` that CI reporters and debugging tools use.

## What's out of scope

- Only the curated flow-level scalars above are diffed. Noisy or structural root collections stay out: `processMetadataValues`, `variables`, `formulas`, choices, stages, and `startElementReference`.
- Flow-level headers aren't rendered for whole-flow adds and deletes. The graph-level add or delete is the signal reviewers see.
- Subflows are opaque nodes, and there's no rename detection.

For rationale and roadmap, see the work items `fl-semantic-diff-render-mvp` and `fl-gitlab-ci-mr-comment`, and the topic docs in `docs/`.
