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

It operates in one of two mutually exclusive modes, selected by which flags are
present.

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

The four core git-mode flags are required; `--changed-only` is optional.

## Common flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--out <dir>` | `./flow-delta-out` | Output directory (created if missing). |
| `--json` | off | Also write `<flow>.diff.json` alongside the HTML. |

## Outputs

Per flow, written to the out directory:

- `<flowName>.html`: the self-contained interactive diff (open in a browser).
- `<flowName>.diff.json`: the machine-readable `FlowDiff` (only with `--json`).

The file stem is derived from the flow name via `safeFileName` (non-alphanumerics
collapsed to `_`). For a **deleted** flow the *old* name is preserved.

A one-line summary is printed per flow:

```
My_Flow: nodes 1 added, 0 deleted, 1 modified; edges 2 added, 0 deleted
```

When curated flow-root attributes changed, the same line gets an additive suffix:

```
My_Flow: nodes 0 added, 0 deleted, 0 modified; edges 0 added, 0 deleted; flow attributes: 1 changed (status)
```

Failures are isolated: in git mode, one flow failing to parse logs an error and
sets a non-zero exit code but does not abort the remaining flows.

## Rendering all fixtures (smoke review)

```bash
npm run render:fixtures            # → flow-delta-out/fixtures/<case>.html (+ .diff.json)
```

`bin/render-fixtures.sh` renders every `fixtures/diff/<case>/` pair, naming each
artifact after the fixture directory so they never collide even when two fixtures
share an internal flow name. See [testing.md](testing.md).

For GitLab MR reporting and artifact links, see [ci.md](ci.md).
