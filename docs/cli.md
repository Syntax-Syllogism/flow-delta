---
title: CLI usage
description: File, Git, Salesforce org comparison, and as-built snapshot modes.
---

# CLI usage

FlowDelta ships a packaged CLI as the `flow-delta` binary, published as
`@syntax-syllogism/flow-delta`. For local source runs during development, the
entry point is `src/cli.ts`.

```bash
npx @syntax-syllogism/flow-delta <options>
```

If you've already installed the package (`npm install` or `npm install -g`),
the plain `flow-delta` binary is on your `PATH` / in `node_modules/.bin`, so
`npx flow-delta <options>` works too. A bare `npx flow-delta` with nothing
installed will fail: there's no unscoped `flow-delta` package on npm.

From a source checkout, invoke the TypeScript entry point through the local
runner: `node --import tsx src/cli.ts <options>` (or
`npx --no-install tsx src/cli.ts <options>`).

It operates in one of four mutually exclusive modes, selected by which flags
are present.

## As-built mode: render one current Flow

As-built mode creates a self-contained snapshot of a single Flow. It has no
before/after comparison, so the artifact uses element-type colors, an element
inventory, neutral read-only property panels, and a provenance footer.

```bash
# Local file
npx @syntax-syllogism/flow-delta --as-built --file path/to/My_Flow.flow-meta.xml

# Latest Active (or highest) org version, or a named version
npx @syntax-syllogism/flow-delta --as-built --org my-org --flow My_Flow
npx @syntax-syllogism/flow-delta --as-built --org my-org --flow My_Flow --flow-version 3

# One git ref; --path may be a literal path or supported glob
npx @syntax-syllogism/flow-delta --as-built --repo /path/to/repo --at v1.2 --path 'force-app/**/*.flow-meta.xml'
```

Exactly one of the three input forms is required. --json writes the
machine-readable snapshot as <flowName>.diff.json, and --out selects the
output directory. As-built mode cannot be combined with diff version flags or
interactive/changed-only options.

## File mode: compare two local files

```bash
npx @syntax-syllogism/flow-delta \
  --old path/to/before.flow-meta.xml \
  --new path/to/after.flow-meta.xml \
  --out ./flow-delta-out \
  --json
```

- `--old` / `--new`: the two `.flow-meta.xml` files to compare (both required).

## Git mode: compare two refs in a repo

```bash
npx @syntax-syllogism/flow-delta \
  --repo /path/to/sfdx-repo \
  --from <base-ref> --to <head-ref> \
  --path 'force-app/**/*.flow-meta.xml' \
  --out ./flow-delta-out \
  --json
```

- `--repo`: repository to read from.
- `--from` / `--to`: the two git refs (SHAs, branches, tags).
- `--path`: a file path or glob (`*` within a segment, `**` across segments,
  `?`). Files are discovered with `git ls-tree -r --name-only` on **both** refs
  and unioned, so additions, deletions, and renames are all visible.
- `--changed-only`: optional filter that intersects the discovered files with
  `git diff --name-only --diff-filter=ACMRD <from> <to> -- <pathspec>`, so only
  flows that actually changed are rendered.

Both products use the shared metadata/Git input boundary described in
[metadata-io.md](metadata-io.md). It normalizes Git path separators, removes
duplicates, and returns stable sorted paths; product-specific flag validation
and default patterns remain in each CLI.

The four core git-mode flags are required; `--changed-only` is optional.

## Org mode: compare two versions from Salesforce

Org mode uses the Salesforce CLI's existing authentication and retrieves two
historical Flow versions as metadata XML before passing them through the same
pipeline as file mode:

```bash
npx @syntax-syllogism/flow-delta \
  --org my-org \
  --flow My_Flow \
  --from-version 1 --to-version 2 \
  --out ./flow-delta-out \
  --json
```

- `--org`: Salesforce org alias or username already authenticated in `sf`.
- `--flow`: Flow developer name. Omit it to choose from an interactive list.
- `--from-version` / `--to-version`: two version numbers. Omit either to use
  the interactive picker, which defaults to the latest two versions.
- `--interactive`: always show the picker.
- `--keep`: retain the temporary Salesforce project for troubleshooting; it is
  deleted automatically after the diff otherwise.

The picker requires a TTY. In CI or other non-interactive environments, provide
`--flow`, `--from-version`, and `--to-version` explicitly.

Org mode requires the Salesforce CLI (`sf`) at runtime. FlowDelta does not
handle Salesforce credentials. Authenticate first with `sf org login web`.
Missing `sf`, unauthenticated orgs, unknown flows, unavailable versions, and
legacy flows without a modern `<start>` element produce actionable errors.

On Windows, FlowDelta invokes the Salesforce CLI through its `sf.cmd` shim.
The shell launching Node must still expose the Salesforce CLI on `PATH`; if
PowerShell can find `sf` but Git Bash cannot, add the Salesforce CLI directory
to Git Bash's `PATH` or run the command from PowerShell.

## Common flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--out <dir>` | `./flow-delta-out` | Output directory (created if missing). |
| `--json` | off | Also write `<flow>.diff.json` alongside the HTML. |

## Outputs

Per flow, written to the out directory:

- `<flowName>.html`: the self-contained interactive diff or snapshot (open in a
  browser).
- `<flowName>.diff.json`: the machine-readable `FlowDiff` (only with `--json`);
  as-built output has `mode: "snapshot"` and `present` nodes/edges.

The file stem is derived from the flow name via `safeFileName` (non-alphanumerics
collapsed to `_`). For a **deleted** flow the *old* name is preserved.

A one-line summary is printed per flow:

```
My_Flow: nodes 1 added, 0 deleted, 1 modified; edges 2 added, 0 deleted
```

As-built mode prints an inventory summary instead:

```
My_Flow: 12 elements, 11 connectors
```

After the run, the CLI also prints the absolute output directory, for example
`Artifacts written to C:\path\to\flow-delta-out`.

When curated flow-root attributes changed, the same line gets an additive suffix:

```
My_Flow: nodes 0 added, 0 deleted, 0 modified; edges 0 added, 0 deleted; flow attributes: 1 changed (status)
```

Failures are isolated: in git mode, one flow failing to parse logs an error and
sets a non-zero exit code but does not abort the remaining flows.

## Rendering fixture artifacts (smoke review)

The fixture renderer accepts `flow`, `flexipage`, or `all`:

```bash
npm run render:fixtures -- flow       # → flow-delta-out/fixtures/<case>.html
npm run render:fixtures -- flexipage  # → flexipage-delta-out/fixtures/<case>.html
npm run render:fixtures                # both product fixture sets
```

The default `all` mode writes Flow artifacts to
`flow-delta-out/fixtures/` and FlexiPage artifacts to
`flexipage-delta-out/fixtures/`. A custom output directory is accepted after
the selector; in `all` mode it receives `flow/` and `flexipage/` subdirectories.
The legacy `bin/render-fixtures.sh OUT_DIR` form remains Flow-only.

`bin/render-fixtures.sh` renders every selected fixture pair, naming each
artifact after its fixture directory so artifacts never collide even when two
fixtures share an internal metadata name. See [testing.md](testing.md).

For GitLab MR reporting and artifact links, see [ci.md](ci.md).

## FlexiPageDelta sibling CLI

FlexiPageDelta is published by the same package under the `flexipage-delta`
binary. It compares `.flexipage-meta.xml` files and writes an offline outline
artifact, with a template-aware wireframe when geometry is available, to
`./flexipage-delta-out` by default:

```bash
npx flexipage-delta \
  --old path/to/before.flexipage-meta.xml \
  --new path/to/after.flexipage-meta.xml \
  --out ./flexipage-delta-out \
  --json
```

Its git mode has the same `--repo`, `--from`, `--to`, `--path`,
`--changed-only`, `--out`, and `--json` flags. When `--path` is omitted, it
defaults to `force-app/**/*.flexipage-meta.xml`:

```bash
npx flexipage-delta \
  --repo /path/to/sfdx-repo \
  --from <base-ref> --to <head-ref> \
  --changed-only \
  --json
```

The output is `<safe-page-name>.html` plus `<safe-page-name>.diff.json` when
JSON output is enabled. The summary reports components, regions, region
metadata changes, and page attributes. See [flexipage.md](flexipage.md) for
the identity/canonicalization rules and outline behavior.
