---
title: CLI usage
description: File, Git, Salesforce org comparison, and as-built snapshot modes.
---

# CLI usage

FlowDelta's CLI is the `flow-delta` binary, published in `@syntax-syllogism/flow-delta`. In a source checkout, the entry point is `src/cli.ts`.

```bash
npx @syntax-syllogism/flow-delta <options>
```

Once the package is installed (`npm install` or `npm install -g`), the `flow-delta` binary is on your `PATH` or in `node_modules/.bin`, so `npx flow-delta <options>` works too. A bare `npx flow-delta` with nothing installed fails, because there's no unscoped `flow-delta` package on npm.

From a source checkout, run the TypeScript entry point through the local runner: `node --import tsx src/cli.ts <options>` or `npx --no-install tsx src/cli.ts <options>`.

The CLI has four modes. They're mutually exclusive, and the flags you pass select one.

## As-built mode: render one current Flow

As-built mode makes a self-contained snapshot of a single Flow. There's no before and after, so the artifact uses element-type colors, an element inventory, read-only property panels, and a provenance footer.

```bash
# Local file
npx @syntax-syllogism/flow-delta --as-built --file path/to/My_Flow.flow-meta.xml

# Latest Active (or highest) org version, or a named version
npx @syntax-syllogism/flow-delta --as-built --org my-org --flow My_Flow
npx @syntax-syllogism/flow-delta --as-built --org my-org --flow My_Flow --flow-version 3

# One git ref; --path may be a literal path or supported glob
npx @syntax-syllogism/flow-delta --as-built --repo /path/to/repo --at v1.2 --path 'force-app/**/*.flow-meta.xml'
```

Give exactly one of the three input forms. `--json` writes the machine-readable snapshot as `<flowName>.diff.json`, and `--out` picks the output directory. As-built mode can't be combined with diff version flags or with the interactive and changed-only options.

## File mode: compare two local files

```bash
npx @syntax-syllogism/flow-delta \
  --old path/to/before.flow-meta.xml \
  --new path/to/after.flow-meta.xml \
  --out ./flow-delta-out \
  --json
```

- `--old` and `--new` are the two `.flow-meta.xml` files. Both are required.

## Git mode: compare two refs

```bash
npx @syntax-syllogism/flow-delta \
  --repo /path/to/sfdx-repo \
  --from <base-ref> --to <head-ref> \
  --path 'force-app/**/*.flow-meta.xml' \
  --out ./flow-delta-out \
  --json
```

- `--repo` is the repository to read.
- `--from` and `--to` are the two git refs: SHAs, branches, or tags.
- `--path` is a file path or glob (`*` within a segment, `**` across segments, `?`). Files are found with `git ls-tree -r --name-only` on **both** refs and unioned, so additions, deletions, and renames all show up.
- `--changed-only` is optional. It keeps only the discovered files that also appear in `git diff --name-only --diff-filter=ACMRD <from> <to> -- <pathspec>`, so only flows that changed are rendered.

`--repo`, `--from`, `--to`, and `--path` are all required. `--changed-only` is the only optional one.

Both products share the metadata and Git input boundary described in [metadata-io.md](metadata-io.md). It normalizes path separators, removes duplicates, and returns paths in a stable order. Flag validation and default patterns stay in each CLI.

## Org mode: compare two versions from Salesforce

Org mode reuses the Salesforce CLI's authentication. It retrieves two historical Flow versions as metadata XML and sends them through the same pipeline as file mode:

```bash
npx @syntax-syllogism/flow-delta \
  --org my-org \
  --flow My_Flow \
  --from-version 1 --to-version 2 \
  --out ./flow-delta-out \
  --json
```

- `--org` is a Salesforce org alias or username already authenticated in `sf`.
- `--flow` is the Flow developer name. Leave it out to pick from an interactive list.
- `--from-version` and `--to-version` are the two version numbers. Leave either out to use the interactive picker, which defaults to the latest two versions.
- `--interactive` always shows the picker.
- `--keep` keeps the temporary Salesforce project for troubleshooting. Otherwise it's deleted after the diff.

The picker needs a TTY. In CI or any other non-interactive setting, pass `--flow`, `--from-version`, and `--to-version`.

Org mode needs the Salesforce CLI (`sf`) at runtime. FlowDelta never handles Salesforce credentials, so sign in first with `sf org login web`. Errors are actionable for a missing `sf`, an unauthenticated org, an unknown flow, an unavailable version, and a legacy flow with no modern `<start>` element.

On Windows, FlowDelta calls the Salesforce CLI through its `sf.cmd` shim. The shell that launches Node still has to have the Salesforce CLI on its `PATH`. If PowerShell finds `sf` but Git Bash doesn't, add the Salesforce CLI directory to Git Bash's `PATH`, or run the command from PowerShell.

## Common flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--out <dir>` | `./flow-delta-out` | Output directory. Created if it's missing. |
| `--json` | off | Also write `<flow>.diff.json` next to the HTML. |

## Output

For each flow, the output directory gets:

- `<flowName>.html`, the self-contained interactive diff or snapshot. Open it in a browser.
- `<flowName>.diff.json`, the machine-readable `FlowDiff`, only with `--json`. As-built output has `mode: "snapshot"` and `present` nodes and edges.

The file name comes from the flow name through `safeFileName`, which collapses non-alphanumerics to `_`. A **deleted** flow keeps its *old* name.

The CLI prints one summary line per flow:

```
My_Flow: nodes 1 added, 0 deleted, 1 modified; edges 2 added, 0 deleted
```

As-built mode prints an inventory instead:

```
My_Flow: 12 elements, 11 connectors
```

When curated flow-root attributes changed, the line gets a suffix:

```
My_Flow: nodes 0 added, 0 deleted, 0 modified; edges 0 added, 0 deleted; flow attributes: 1 changed (status)
```

After the run, the CLI prints the absolute output directory, for example `Artifacts written to C:\path\to\flow-delta-out`.

Failures don't spread. In git mode, if one flow fails to parse, the CLI logs an error and sets a non-zero exit code, but keeps going with the remaining flows.

## Render fixture artifacts

The fixture renderer accepts `flow`, `flexipage`, or `all`:

```bash
npm run render:fixtures -- flow       # → flow-delta-out/fixtures/<case>.html
npm run render:fixtures -- flexipage  # → flexipage-delta-out/fixtures/<case>.html
npm run render:fixtures                # both product fixture sets
```

`all` is the default. It writes Flow artifacts to `flow-delta-out/fixtures/` and FlexiPage artifacts to `flexipage-delta-out/fixtures/`. You can put a custom output directory after the selector. In `all` mode, it gets `flow/` and `flexipage/` subdirectories. The older `bin/render-fixtures.sh OUT_DIR` form still works, for Flow only.

`bin/render-fixtures.sh` renders every selected fixture pair and names each artifact after its fixture directory, so two fixtures with the same internal metadata name never collide. See [testing.md](testing.md).

For GitLab MR reporting and artifact links, see [ci.md](ci.md).

## FlexiPageDelta CLI

The same package ships FlexiPageDelta as the `flexipage-delta` binary. It compares `.flexipage-meta.xml` files and writes an offline outline artifact, plus a template-aware wireframe when geometry is available. The default output directory is `./flexipage-delta-out`:

```bash
npx flexipage-delta \
  --old path/to/before.flexipage-meta.xml \
  --new path/to/after.flexipage-meta.xml \
  --out ./flexipage-delta-out \
  --json
```

Git mode takes the same `--repo`, `--from`, `--to`, `--path`, `--changed-only`, `--out`, and `--json` flags. Without `--path`, it defaults to `force-app/**/*.flexipage-meta.xml`:

```bash
npx flexipage-delta \
  --repo /path/to/sfdx-repo \
  --from <base-ref> --to <head-ref> \
  --changed-only \
  --json
```

The output is `<safe-page-name>.html`, plus `<safe-page-name>.diff.json` with JSON output on. The summary counts components, regions, region metadata changes, and page attributes. See [flexipage.md](flexipage.md) for the identity and canonicalization rules and how the outline behaves.
