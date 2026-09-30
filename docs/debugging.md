---
title: Debugging and Troubleshooting
description: Diagnose parse errors, unexpected diffs, and layout issues.
---

# Debugging and Troubleshooting

How to track down problems with parsing, diffs, rendering, layout, and CI reporting.

## General workflow

1. **Isolate it.** Can you reproduce the problem with a minimal flow or fixture?
2. **Check the JSON.** Run with `--json` and inspect the `*.diff.json` file.
3. **Look at the render.** Open the `.html` artifact in a browser.
4. **Read the source.** Find the relevant module (parser, model, diff, or render).
5. **Add a fixture.** Commit a minimal test case, so the problem stays fixed.

## Parse errors

### Symptom: "Failed to parse <path>"

The XML parser hit malformed or unsupported XML.

1. **Check the XML is valid.**

   ```bash
   xmllint before.flow-meta.xml  # if xmllint is available
   ```

2. **Check for a known parser limit.** The vendored parser comes from Google Flow Lens (Apache-2.0). It may not support every Salesforce feature yet. See `src/parser/flow_types.ts` for the supported element types.
3. **Check the encoding.** Salesforce exports UTF-8 with a BOM. The parser uses `xml2js`, which handles a BOM, but malformed UTF-8 can still fail.
4. **Read the error.** Parser errors appear in the CLI output. To see the full stack trace, run one flow in file mode:

   ```bash
   npx tsx src/cli.ts --old before.xml --new after.xml --out out/
   ```

5. **Consider a new element type.** If Salesforce shipped a new element, it may not be in `NodeType` yet. Add it to `src/model/graph-model.ts`, then to the parser if needed. See [Extending node types](extending-node-types.md).

## A no-op save shows changes

### Symptom: a file with only cosmetic changes (such as moved coordinates) shows as modified

This shouldn't happen. The [canonicalization rules](architecture.md#invariants-that-must-hold) exist to prevent it.

1. **See what changed.**

   ```bash
   npx tsx src/cli.ts --old before.xml --new after.xml --json --out out/
   cat out/*.diff.json | jq '.nodes[] | select(.status == "modified")'
   ```

2. **Identify the property.** Look at the `.changes` array of each modified node.
   - Coordinates (`locationX`, `locationY`) should be stripped.
   - Connector references should move to edges.
   - Array order: check whether the array belongs in `UNORDERED_ARRAY_KEYS`.
3. **Check canonicalization.** In `src/model/build-model.ts`, look at:
   - `TOP_LEVEL_KEYS`: is the property stripped?
   - `EDGE_KEYS`: are connector references removed?
   - `UNORDERED_ARRAY_KEYS`: is the array sorted?
4. **Check the test.** The `noop_save` fixture is the regression test. Run `npm test` and look for its assertion. If it fails, canonicalization is broken.
5. **Fix canonicalization.** To ignore a property, add it to `TOP_LEVEL_KEYS` or `UNORDERED_ARRAY_KEYS`. Update the `noop_save` fixture, re-run the tests, and document the change in [architecture.md](architecture.md#2-canonicalization-in-build-modelts).

## Unexpected added, deleted, or modified nodes

### Symptom: a node shows as added or deleted when it shouldn't (or the reverse)

1. **Check node identity.** Nodes match by `name`, not label. A renamed node reads as a delete plus an add. Check the node `id`:

   ```bash
   cat out/*.diff.json | jq '.nodes[] | {id, type, status}'
   ```

2. **Confirm the node exists in both versions.**

   ```bash
   grep '<name>YourNodeName</name>' before.xml after.xml
   ```

   - In `before` only: it was really deleted.
   - In both, but shown as deleted: the name probably changed.
3. **Check case and special characters.** XML names are case-sensitive, so `MyNode` and `mynode` differ. Compare the exact `<name>` in both files.
4. **Check git mode.** Git mode finds files with `git ls-tree -r` on both refs. A file renamed at the git level appears as added plus deleted. Run `git diff --name-status` on the same refs to see what changed.

## Wrong or missing property deltas

### Symptom: a changed property is missing, or an unchanged one shows as changed

1. **Check canonicalization.** `deepDiff` works on `node.properties` after stripping, so a stripped property can't diff. See `TOP_LEVEL_KEYS` and `EDGE_KEYS` in `build-model.ts`.
2. **Test `deepDiff` alone.** If it doesn't return the deltas you expect, the problem is in `src/diff/deep-diff.ts`. Look for recursion depth limits or special cases.
3. **Check for an unordered array.** Arrays in `UNORDERED_ARRAY_KEYS` are sorted during canonicalization, so an order-only change shows nothing. To track reordering, remove the key from the list.
4. **Read the raw JSON.**

   ```bash
   cat out/*.diff.json | jq '.nodes[] | select(.id == "MyNodeId")'
   ```

   Check `.changes[]` for the property path. Paths use dots and array indexes, like `rules[0].conditions[1].value`.
5. **Check the render.** The JSON can be right while the HTML hides the change. Click the modified node and check that its section schema shows the property.

## HTML rendering issues

### Symptom: the artifact won't open, looks malformed, or the detail panel shows wrong data

1. **Check the file exists.**

   ```bash
   ls -lh flow-delta-out/*.html
   ```

   A non-trivial flow should be over 100 KB. The timestamp should match your CLI run.
2. **Check the browser console.** Open the `.html`, press F12, and look at the Console for errors. All JS is inline, so network errors are unlikely.
3. **Check the embedded payload.** The HTML embeds a client-oriented object as the `DATA` constant. It's separate from the optional neighboring `*.diff.json`. View the page source, search for `const DATA =`, and check the JSON is valid. If it's corrupt, the renderer has nothing to show.
4. **Try a fixture.** Run `npm run render:fixtures`, then open:
   - `flow-delta-out/fixtures/noop_save.html` (should show zero changes)
   - `flow-delta-out/fixtures/modify_decision.html` (should show decision rule changes)

   If the fixtures render correctly, the problem is specific to your flow.
5. **Check the detail panel.** Click a modified node and check that its properties appear in the expected sections. If some are missing, check the schema in `render/section-schemas.ts`.

### Symptom: view filters (All / After / Before / Changes only) don't work

1. **Check the browser.** Filters are client-side JavaScript. Try a current Chrome, Firefox, or Safari.
2. **Check the baked layouts.** The renderer precomputes `union`, `before`, and `after` layouts. Search the HTML source for `"union"`, `"before"`, and `"after"` in the embedded data. All three should be there.
3. **Check the filtered graph.** `Changes only` hides unchanged nodes and edges. If most nodes are unchanged, that view can look sparse or disconnected. This is correct. Use `All` for the full context.

## Layout issues

### Symptom: nodes overlap, edges tangle, or the graph is unreadable

1. **Check the ELK setup.** The renderer uses ELK (Eclipse Layout Kernel) for a deterministic layout. Its parameters are hardcoded in `src/render/layout.ts`. Large graphs (100+ nodes) can be dense. Try zooming out.
2. **Check the graph size.** Count the nodes and edges in the `*.diff.json` export. The HTML's embedded data has the same semantic identities, plus geometry and rendered detail HTML. A large flow can have 100+ nodes and 150+ edges, and ELK may overlap positions on complex graphs. This is a known limitation.
3. **Look for disconnected parts.** Unreachable nodes (orphaned decision branches, dead code) may cluster apart. Use `Changes only` to focus.
4. **Accept the limit.** The layout is deterministic, and the browser can't re-run it. If a layout is unusable, open an issue with the graph structure.

## CI reporting issues

### Symptom: `flow-delta-gitlab` fails, or the MR comment doesn't appear

See [ci.md](ci.md) for GitLab details. Key checks:

1. **Token.** Does `$FlowDelta_GITLAB_TOKEN` exist and have the `api` scope? Run locally with `--token` to test.
2. **diff.json files.** The reporter reads `*.diff.json` from the output directory. Are they present and valid? Run `flow-delta` first to create them.
3. **API permissions.** The reporter creates and updates notes on the MR. Check that the token's project or group has API access.
4. **CI logs.** Reporter errors go to stdout. Look for API error codes (401 auth, 404 not found, and so on).

### Symptom: `flow-delta-github` fails, or the PR comment doesn't appear

See [ci.md](ci.md#github-actions) for the full GitHub flow. Key checks:

1. **Token and permissions.** The job needs `permissions: pull-requests: write` for `$GITHUB_TOKEN`. On a fork PR, the default `pull_request` token is read-only, so commenting fails there by design. See `ci.md` for the `pull_request_target` caveat.
2. **PR number.** The reporter makes no API calls if it can't resolve a PR number. For example, the workflow ran on `push` instead of `pull_request`, or `GITHUB_EVENT_PATH` doesn't point at a `pull_request` payload. Pass `--pr <number>` locally to test.
3. **diff.json files.** As with GitLab, run `flow-delta` first. A run with zero changed diffs (including no `changedFlowAttributes`) is also a no-op, by design.
4. **Job logs.** Errors go to stdout. Look for GitHub API codes (401, 403, 404). When the step is marked `continue-on-error: true`, a non-2xx response fails the reporter but not the job.

## Performance

### Symptom: the CLI is slow or uses a lot of memory

1. **Use `--changed-only` in git mode.** It limits the flow list to flows that changed, which saves parsing and diffing time:

   ```bash
   npx tsx src/cli.ts --repo . --from main --to feature --path force-app --changed-only
   ```

2. **Profile the pipeline.** Measure parse, diff, and render time separately. A slow flow usually has many nodes and edges.
3. **Consider splitting very large flows.** A flow with 500+ nodes lays out slowly. That isn't a bug, and the output is still valid.
4. **Check your Node version.** Node 18+ is required. Node 20+ is faster. Run `node --version`.

## Adding a fixture for your issue

Once you've isolated the problem, add a fixture so it can't come back.

1. Save the before and after flows:

   ```bash
   mkdir -p fixtures/diff/my_issue/
   cp before.xml fixtures/diff/my_issue/before.flow-meta.xml
   cp after.xml fixtures/diff/my_issue/after.flow-meta.xml
   ```

2. Add a test row in `test/semantic-diff.test.ts`:

   ```typescript
   {
     name: "my_issue",
     expectedSummary: { addedNodes: ..., removedNodes: ..., ... },
     assertion: (diff) => {
       // Assert the specific behavior you're testing
     }
   }
   ```

3. Run `npm test`.
4. Commit the fixture. Fixtures are part of the test suite.

## Asking for help

Open an issue at <https://github.com/Syntax-Syllogism/flow-delta/issues>. Include:

- minimal before/after flows, or a fixture directory;
- the exact CLI command;
- expected versus actual output;
- the `diff.json` output (run with `--json`);
- your Node version (`node --version`) and OS; and
- any error messages.
