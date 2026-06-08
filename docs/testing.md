# Testing

Tests use the Node built-in runner (`node:test` + `node:assert/strict`) executed
through `tsx`.

```bash
npm test            # parser suite + semantic diff / render / CLI coverage
npm run test:parser # parser regression suite only
```

## Layout

- `test/parser.test.ts` — the vendored parser's own suite, ported to `node:test`
  (proves the Apache-2.0 parser behaves identically under Node). See
  [vendoring.md](vendoring.md).
- `test/semantic-diff.test.ts` — everything we built: canonicalization, `deepDiff`
  paths, node/edge classification, edge-id rules, the HTML render, the CLI in both
  modes, and the real before/after fixture assertions.
- `test/gitlab-report.test.ts` — GitLab reporting helpers, sticky-note upsert
  behavior, and the package/build smoke checks.

## Fixtures (`fixtures/`)

- `fixtures/parse/*.flow-meta.xml` — single-flow goldens for parser coverage.
- `fixtures/diff/<case>/before.flow-meta.xml` + `after.flow-meta.xml` — real
  before/after pairs retrieved from an org, one directory per scenario:
  `noop_save`, `add_node`, `modify_assignment`, `modify_decision`,
  `rewire_connector`, `fault_path`.

`noop_save` is the most important: a real save with **only** coordinate churn,
asserted to produce zero node/edge changes — the headline canonicalization gate.

## Adding a diff fixture

1. Retrieve the flow, commit it, make the change in the org, retrieve again — the
   two versions are your `before`/`after`. Keep both files' internal flow
   `<label>`/`fullName` consistent so artifact names aren't confusing.
2. Drop them under `fixtures/diff/<your_case>/`.
3. Add a row to the `DIFF_CASES` table in `test/semantic-diff.test.ts` with the
   expected summary counts, and (optionally) a targeted assertion on the changed
   property path or edge.
4. Confirm with `npm test` and eyeball the render via `npm run render:fixtures`.

Capture the expected counts from the validated CLI output (`--json` summary)
rather than guessing.

## Manual / visual smoke

`npm run render:fixtures` writes one HTML per fixture to `flow-delta-out/fixtures/`.
Open them and check: status colors and legend, directional edge arrowheads
(normal solid / fault dashed), the side panel showing per-node `path: before →
after` deltas, and pan/zoom. A fuller manual checklist and the fixture scenario
matrix live in this file and the inline comments in `test/semantic-diff.test.ts`.
