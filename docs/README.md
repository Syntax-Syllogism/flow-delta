---
title: FlowDelta Documentation
description: Complete guides for using, understanding, and extending FlowDelta.
---

# FlowDelta documentation

Guides for using, understanding, and extending FlowDelta.

## Start here

New to the project? Read these three in order:

1. [Getting started](getting-started.md): set up locally, run the tests, find your way around the code.
2. [Salesforce Flow primer](salesforce-flow-primer.md): what a `.flow-meta.xml` file is and how it's structured.
3. [Architecture](architecture.md): the pipeline, from parser to model to diff or snapshot to render.

## Using FlowDelta

- [CLI usage](cli.md): file, git, Salesforce org, and as-built modes, with all options and output formats.
- [Shared metadata and Git IO](metadata-io.md): how both CLIs read local files and Git history.
- [CI integration](ci.md): GitLab and GitHub pipelines, MR and PR comments, and viewing artifacts in private repos.
- [FlexiPageDelta](flexipage.md): semantic diffs and wireframes for Lightning pages.

## Understanding the system

- [Data model reference](data-model.md): the core types (`GraphModel`, `GraphNode`, `FlowDiff`) and how they move through the pipeline.
- [Architecture](architecture.md): what each module does, how properties are canonicalized, and the invariants that must hold.
- [Rendering](render.md): the interactive HTML, layout strategy, and side panel.

## Extending FlowDelta

- [Section schema authoring](section-schemas.md): group a node type's properties into meaningful sections.
- [Adding new node types](extending-node-types.md): support a new Salesforce Flow element.
- [Publishing](publishing.md): build, package, and release to npm.

## Working on the project

- [Testing](testing.md): test layout, fixtures, and how to add a case.
- [Debugging and troubleshooting](debugging.md): parse errors, unexpected diffs, and layout problems.
- [Vendoring policy](vendoring.md): the Apache-2.0 parser, where it came from, and why you don't edit it.
- [Documentation site](docs-site.md): preview locally, write links, and publish.

## I want to...

**Compare flows locally or from Salesforce**
→ [Getting started](getting-started.md), then [CLI usage](cli.md)

**Render a current Flow as an as-built snapshot**
→ [CLI usage](cli.md#as-built-mode-render-one-current-flow), then [Rendering](render.md#as-built-snapshots)

**Set up CI reporting in GitLab or GitHub**
→ [CI integration](ci.md), plus [examples/gitlab-ci.yml](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/examples/gitlab-ci.yml) or [examples/github-actions.yml](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/examples/github-actions.yml)

**Work out why a diff looks wrong**
→ [Debugging and troubleshooting](debugging.md), then [Data model reference](data-model.md)

**Support a new Salesforce element type**
→ [Adding new node types](extending-node-types.md), then [Section schema authoring](section-schemas.md)

**Improve how changes look**
→ [Section schema authoring](section-schemas.md), then [Rendering](render.md)

**Understand the code**
→ [Architecture](architecture.md), then [Data model reference](data-model.md), then the module you care about

**Write a test**
→ [Testing](testing.md), then [Debugging and troubleshooting](debugging.md)

**Cut a release**
→ [Publishing](publishing.md)

**Build or update the docs site**
→ [Documentation site](docs-site.md)

## Which doc covers which module

| Module | Doc |
|--------|-----|
| `src/parser/` | [Vendoring policy](vendoring.md) (read-only, Apache-2.0) |
| `src/io/` | [Shared metadata and Git IO](metadata-io.md), [CLI usage](cli.md) |
| `src/model/` | [Data model reference](data-model.md), [Architecture](architecture.md) |
| `src/diff/` | [Architecture](architecture.md) |
| `src/render/` | [Rendering](render.md), [Section schema authoring](section-schemas.md) |
| `src/ci/` | [CI integration](ci.md) |
| `test/` | [Testing](testing.md), [Debugging and troubleshooting](debugging.md) |

## Key terms

- **Canonicalization:** cleaning up properties before diffing: dropping coordinates and connectors, and sorting unordered arrays. See [Architecture](architecture.md#2-canonicalization-in-build-modelts).
- **Section schema:** per-node-type settings that group property changes into meaningful sections, such as "Outcomes" for a decision. See [Section schema authoring](section-schemas.md).
- **GraphModel:** the normalized form of a Flow after parsing: nodes and edges, without coordinates or connectors. See [Data model reference](data-model.md).
- **FlowDiff:** the result of a comparison or an as-built snapshot: nodes and edges marked added, deleted, modified, unchanged, or present, with their properties. See [Data model reference](data-model.md).
- **Fixture:** a before-and-after pair of flows used to test behavior. See [Testing](testing.md).
- **Vendored parser:** Google's Flow Lens parser (Apache-2.0), copied in as-is and never edited. See [Vendoring policy](vendoring.md).

## Conventions

- File paths are relative to the project root, for example `src/cli.ts`.
- Code examples use `npm` and `npm run` scripts. See [package.json](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/package.json).
- Terminal examples use bash. On Windows, use PowerShell or Git Bash.
- Links to source assume you have the repo cloned and open.

## Contributing and license

See [CONTRIBUTING.md](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/CONTRIBUTING.md) for code style, PR expectations, and workflow.

FlowDelta's code is MIT. The vendored parser is Apache-2.0. See [LICENSE](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/LICENSE) and [LICENSE-APACHE](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/LICENSE-APACHE).
