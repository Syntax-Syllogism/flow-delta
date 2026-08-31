---
title: FlowDelta Documentation
description: Complete guides for using, understanding, and extending FlowDelta.
---

# FlowDelta Documentation

Complete guides for using, understanding, and extending FlowDelta.

## Quick start

**New to the project?** Start here:

1. [Getting Started](getting-started.md) — Set up locally, run tests, understand the codebase structure
2. [Salesforce Flow Primer](salesforce-flow-primer.md) — What is a `.flow-meta.xml` file and how is it structured?
3. [Architecture](architecture.md) — The pipeline: parser → model → diff → render

## Using FlowDelta

- [CLI usage](cli.md) — File, git, and Salesforce org modes, command-line options, output formats
- [Shared metadata/Git IO](metadata-io.md) — Local/Git reader and discovery contracts used by both CLIs
- [CI Integration](ci.md) — Running in GitLab/GitHub pipelines, MR/PR reporting, sticky comments, private-repo artifact viewing

## Understanding the system

- **[Data Model Reference](data-model.md)** — Core types (GraphModel, GraphNode, FlowDiff, etc.) and how they flow through the pipeline
- **[Salesforce Flow XML Primer](salesforce-flow-primer.md)** — XML structure, element types, connectors, and how FlowDelta parses them
- [Architecture](architecture.md) — Module responsibilities, canonicalization rules, invariants that must hold
- [Rendering](render.md) — Interactive HTML features, section schemas, layout strategy, side panel organization
- [FlexiPageDelta](flexipage.md) — Semantic diffs and wireframes for Salesforce Lightning pages

## Extending and customizing

- [Section Schema Authoring](section-schemas.md) — How to define semantic property grouping for new or modified node types
- [Extending for New Node Types](extending-node-types.md) — Adding support for new Salesforce Flow elements
- [Publishing](publishing.md) — Build, package, and npm release process

## Development

- [Testing](testing.md) — Test layout, test fixtures, how to add new test cases
- [Getting Started](getting-started.md) — Local setup, running tests, common workflows
- [Debugging & Troubleshooting](debugging.md) — Parse errors, unexpected diffs, layout issues, and troubleshooting strategies
- [Vendoring Policy](vendoring.md) — The Apache-2.0 parser, provenance, do-not-edit rules, licensing
- [Documentation site](docs-site.md) — Local preview, link authoring, and release publication

## Navigation by task

### I want to...

**Compare flows locally or from Salesforce**
→ [Getting Started](getting-started.md) → [CLI usage](cli.md)

**Set up CI reporting in GitLab or GitHub**
→ [CI Integration](ci.md) + [examples/gitlab-ci.yml](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.8.1/examples/gitlab-ci.yml) /
[examples/github-actions.yml](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.8.1/examples/github-actions.yml)

**Understand why a diff looks wrong**
→ [Debugging & Troubleshooting](debugging.md) → [Data Model Reference](data-model.md)

**Add support for a new Salesforce element type**
→ [Extending for New Node Types](extending-node-types.md) → [Section Schema Authoring](section-schemas.md)

**Improve the visual rendering of changes**
→ [Section Schema Authoring](section-schemas.md) → [Rendering](render.md)

**Understand the code architecture**
→ [Architecture](architecture.md) → [Data Model Reference](data-model.md) → Relevant module

**Write a test for a new scenario**
→ [Testing](testing.md) → [Debugging & Troubleshooting](debugging.md)

**Release a new version**
→ [Publishing](publishing.md)

**Build or update the documentation site**
→ [Documentation site](docs-site.md)

## Module reference

| Module | Doc |
|--------|-----|
| `src/parser/` | [Vendoring Policy](vendoring.md) (read-only, Apache-2.0) |
| `src/io/` | [Shared metadata/Git IO](metadata-io.md), [CLI usage](cli.md) |
| `src/model/` | [Data Model Reference](data-model.md), [Architecture](architecture.md) |
| `src/diff/` | [Architecture](architecture.md) |
| `src/render/` | [Rendering](render.md), [Section Schema Authoring](section-schemas.md) |
| `src/ci/` | [CI Integration](ci.md) |
| `test/` | [Testing](testing.md), [Debugging & Troubleshooting](debugging.md) |

## Key concepts

**Canonicalization** — Normalization of properties before diffing (strips coordinates, connectors, sorts unordered arrays). See [Architecture](architecture.md#canonicalization-in-build-modelts).

**Section schema** — Type-specific configuration for rendering property changes as semantic sections (e.g., "Outcomes" for decisions). See [Section Schema Authoring](section-schemas.md).

**GraphModel** — Normalized representation after parsing: nodes + edges, with coordinates and connectors stripped. See [Data Model Reference](data-model.md).

**FlowDiff** — The semantic diff output: added/deleted/modified nodes and edges with per-property changes. See [Data Model Reference](data-model.md).

**Fixture** — A pair of before/after flows used to test and verify behavior. See [Testing](testing.md).

**Vendored parser** — The Google Flow Lens parser (Apache-2.0), imported verbatim and not edited. See [Vendoring Policy](vendoring.md).

## Documentation map

```
docs/
  README.md (this file)
  getting-started.md       — Local setup & first run
  data-model.md            — Type reference & pipeline overview
  salesforce-flow-primer.md — XML structure & element types
  architecture.md          — Pipeline, modules, invariants
  render.md                — HTML rendering & interactive features
  section-schemas.md       — Semantic property organization
  extending-node-types.md  — Adding new element type support
  cli.md                   — Command-line interface
  metadata-io.md           — Shared metadata and Git input boundary
  ci.md                    — GitLab + GitHub CI integration
  flexipage.md             — Lightning page semantic diff and wireframe pipeline
  testing.md               — Test layout & fixture authoring
  docs-site.md             — Documentation authoring, local build, and publication
  publishing.md            — Build & npm release
  vendoring.md             — Parser policy & licensing
  debugging.md             — Troubleshooting strategies
```

## Conventions

- **File paths** are relative to the project root: `src/cli.ts`, `test/semantic-diff.test.ts`
- **Code examples** use `npm` and `npm run` scripts; see [package.json](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.8.1/package.json)
- **Terminals** show bash/sh syntax; Windows users should use PowerShell or Git Bash
- **Links** to source code assume you've cloned the repo and have it open

## Contributing

See [CONTRIBUTING.md](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.8.1/CONTRIBUTING.md) for code style, PR expectations, and the development workflow.

## License

FlowDelta code is MIT. The vendored parser is Apache-2.0. See [LICENSE](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.8.1/LICENSE) and [LICENSE-APACHE](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.8.1/LICENSE-APACHE).
