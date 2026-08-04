---
title: Debugging and Troubleshooting
description: Diagnose parse errors, unexpected diffs, and layout issues.
---

# Debugging and Troubleshooting

This guide helps you troubleshoot common issues when comparing flows, understanding diffs, and extending FlowDelta.

## General troubleshooting workflow

1. **Isolate the problem:** Can you reproduce it with a minimal flow or fixture?
2. **Check the JSON output:** Run with `--json` and inspect the `*.diff.json` file for the structured diff
3. **Render and inspect:** Open the `.html` artifact in a browser and check the visual representation
4. **Read the source:** Check the relevant module (parser, model, diff, render) for the behavior
5. **Add a fixture:** Commit a minimal test case so it's reproducible and prevents regression

## Parse errors

### Symptom: "Failed to parse <path>"

The XML parser encountered malformed or unsupported XML.

**Steps to debug:**

1. **Verify the XML is valid:**
   ```bash
   xmllint before.flow-meta.xml  # If xmllint is available
   ```

2. **Check if it's a known parser limitation:**
   - The vendored parser is from Google Flow Lens (Apache-2.0). Some Salesforce features may not be fully supported yet.
   - See `src/parser/flow_types.ts` for the supported element types.

3. **Look for encoding issues:**
   - Salesforce exports XML as UTF-8 with BOM
   - The parser uses `xml2js`, which handles BOM, but malformed UTF-8 can cause failures

4. **Check the error message:**
   - Parser errors are surfaced in the CLI output
   - Run with a single flow in file mode to see the full stack trace:
     ```bash
     npx tsx src/cli.ts --old before.xml --new after.xml --out out/
     ```

5. **Is it a new Salesforce element type?**
   - If Salesforce shipped a new element, it may not be in `NodeType` yet
   - Add it to `src/model/graph-model.ts`, then to the parser if needed
   - See [Extending for new node types](#extending-for-new-salesforce-node-types)

## Unexpected zero diff (noop_save produces changes)

### Symptom: A file with only cosmetic changes (coordinate adjustments) shows as modified

This should not happen; the [canonicalization rules](architecture.md#invariants-that-must-hold) are designed to prevent it.

**Steps to debug:**

1. **Check what changed:**
   ```bash
   npx tsx src/cli.ts --old before.xml --new after.xml --json --out out/
   cat out/*.diff.json | jq '.nodes[] | select(.status == "modified")'
   ```

2. **Identify the property:**
   - Look at the `.changes` array for each modified node
   - Is it coordinates (`locationX`, `locationY`)? Should be stripped in canonicalization
   - Is it a connector reference? Should be moved to edges
   - Is it array order? Check if it should be in `UNORDERED_ARRAY_KEYS`

3. **Verify canonicalization:**
   - Open `src/model/build-model.ts` and check:
     - `TOP_LEVEL_KEYS` — are the changed properties stripped?
     - `EDGE_KEYS` — are connector references removed?
     - `UNORDERED_ARRAY_KEYS` — is the array being sorted?

4. **Check the test:**
   - The `noop_save` fixture is the regression test for this
   - Run: `npm test` and look for the `noop_save` assertion
   - If it fails, the canonicalization is broken

5. **Add to canonicalization:**
   - If a property should be ignored, add it to `TOP_LEVEL_KEYS` or `UNORDERED_ARRAY_KEYS`
   - Update the `noop_save` fixture and re-run tests
   - Document the change in `[architecture.md#canonicalization](architecture.md#canonicalization-in-build-modelts)`

## Diff looks wrong (unexpected added/deleted/modified nodes)

### Symptom: A node appears as added or deleted when it shouldn't, or vice versa

**Steps to debug:**

1. **Check node identity:**
   - Nodes are matched by `name` (not label)
   - Did the node get renamed? (That will read as delete + add)
   - Run with `--json` and check the node `id` field:
     ```bash
     cat out/*.diff.json | jq '.nodes[] | {id, type, status}'
     ```

2. **Verify the node exists in both versions:**
   ```bash
   grep '<name>YourNodeName</name>' before.xml after.xml
   ```
   - If it's in `before` but not `after`, it's truly deleted
   - If it's in both but appears deleted, the name might have changed

3. **Check for whitespace or special characters:**
   - XML names are case-sensitive
   - `MyNode` ≠ `mynode`
   - Verify the exact `<name>` in both files

4. **Check git mode:**
   - In git mode, files are discovered via `git ls-tree -r` on both refs
   - If a file is renamed at the git level, it appears as added + deleted
   - Use `git diff --name-status` on the same refs to verify what actually changed

## Property deltas are wrong or missing

### Symptom: A changed property doesn't appear in the diff, or a property shows as changed when it shouldn't

**Steps to debug:**

1. **Check the canonicalization:**
   - Does the changed property get stripped in `build-model.ts`?
   - `deepDiff` works on `node.properties` after stripping, so stripped properties can't diff
   - See `TOP_LEVEL_KEYS` and `EDGE_KEYS`

2. **Run deepDiff in isolation:**
   - `deepDiff` is the generic recursive diff algorithm
   - If it's not producing the expected deltas, the issue is in `deep-diff.ts` logic
   - Check `src/diff/deep-diff.ts` for recursion depth or special cases

3. **Check if it's an unordered array:**
   - Arrays in `UNORDERED_ARRAY_KEYS` are sorted during canonicalization
   - If only the order changed, the diff will show no change
   - If you need to track reordering, remove it from `UNORDERED_ARRAY_KEYS`

4. **Inspect the raw JSON:**
   ```bash
   cat out/*.diff.json | jq '.nodes[] | select(.id == "MyNodeId")'
   ```
   - Check `.changes[]` for the expected property path
   - Paths use dot notation and array indexing: `rules[0].conditions[1].value`

5. **Check the render:**
   - Even if the delta is correct in the JSON, the HTML rendering might be hiding it
   - Open the `.html` in a browser and click the modified node's detail panel
   - Verify the section schema is rendering the property

## HTML rendering issues

### Symptom: The HTML artifact won't open, is malformed, or the detail panel shows incorrect data

**Steps to debug:**

1. **Verify the file was created:**
   ```bash
   ls -lh flow-delta-out/*.html
   ```
   - Check the file size (should be > 100KB for a non-trivial flow)
   - Check the timestamp (should match the CLI run time)

2. **Check browser console:**
   - Open the `.html` in Chrome/Firefox/Safari
   - Press F12 to open DevTools → Console tab
   - Look for JavaScript errors (red text)
   - The HTML is self-contained; all JS is inline, so network errors are unlikely

3. **Verify the embedded client payload:**
   - The HTML embeds a client-oriented DTO as the `DATA` JavaScript constant;
     it is separate from the optional neighboring `*.diff.json` export
   - Open the source (Ctrl+U or right-click → View Page Source)
   - Search for `const DATA =` and check if the JSON looks valid
   - If corrupted, the renderer won't have data to display

4. **Test with a fixture:**
   - Run `npm run render:fixtures`
   - Open `flow-delta-out/fixtures/noop_save.html` (should show zero changes)
   - Open `flow-delta-out/fixtures/modify_decision.html` (should show decision rule changes)
   - If fixtures render correctly, the issue is with your specific flow

5. **Check the detail panel:**
   - Click on a modified node in the HTML
   - Verify the properties appear in the expected sections
   - If properties are missing, check the section schema in `render/section-schemas.ts`

### Symptom: View filters (All / After / Before / Changes only) don't work

**Steps to debug:**

1. **Check the browser:**
   - Filters are client-side JavaScript
   - If the browser is very old, features may not work
   - Test in a modern Chrome/Firefox/Safari

2. **Verify the layout was computed:**
   - The renderer precomputes layouts for `union`, `before`, and `after` views
   - Open the HTML source and search for `"union"`, `"before"`, `"after"` in the embedded DTO
   - All three baked views should be present

3. **Check the filtered graph:**
   - The `Changes only` filter hides unchanged nodes and edges
   - If many nodes are unchanged, the change-only view may be sparse or disconnected
   - This is correct behavior; use `All` to see the full context

## Layout issues

### Symptom: Nodes overlap, edges are tangled, or the graph is unreadable

**Steps to debug:**

1. **Check ELK configuration:**
   - The renderer uses ELK (Eclipse Layout Kernel) for deterministic layout
   - ELK parameters are hardcoded in `src/render/layout.ts`
   - If the graph is large (100+ nodes), layout may be dense; try zooming out

2. **Verify the graph structure:**
   - Open the `*.diff.json` export and count nodes and edges; the HTML's embedded DTO
     contains the same semantic identities plus geometry and rendered detail HTML
   - A large flow may have 100+ nodes and 150+ edges
   - ELK may produce overlapping positions for complex graphs (this is a known limitation)

3. **Check for disconnected components:**
   - If the flow has unreachable nodes (orphaned decision branches, dead code), they may cluster separately
   - Use the `Changes only` filter to focus on relevant changes

4. **Re-layout manually:**
   - ELK is deterministic, but you can't re-layout in the browser
   - If layout is unacceptable, this is a limitation of the layout algorithm
   - Consider opening an issue with the graph structure for investigation

## GitLab/GitHub CI reporting issues

### Symptom: `flow-delta-gitlab` fails, or the MR comment doesn't appear

See [docs/ci.md](ci.md) for troubleshooting GitLab-specific issues. Key points:

1. **Verify the token:**
   - Does `$FlowDelta_GITLAB_TOKEN` exist and have `api` scope?
   - Run locally with `--token` to test

2. **Check the diff.json files:**
   - The reporter reads `*.diff.json` from the output directory
   - Are they present and valid JSON?
   - Run `flow-delta` first to generate them

3. **Verify API permissions:**
   - The reporter needs to create/update notes on the MR
   - Check that the token's project/group has API access

4. **Review the CI logs:**
   - If the reporter runs, errors are printed to stdout
   - Look for API error codes (401 auth, 404 not found, etc.)

### Symptom: `flow-delta-github` fails, or the PR comment doesn't appear

See [docs/ci.md](ci.md#github-actions) for the full GitHub reporting flow. Key points:

1. **Verify the token and permissions:**
   - The job needs `permissions: pull-requests: write` for `$GITHUB_TOKEN`.
   - On a fork PR, the default `pull_request`-event token is read-only, so
     commenting fails there by design; see `ci.md` for the `pull_request_target`
     caveat.

2. **Check that a PR number resolved:**
   - The reporter no-ops (no API calls) if it can't resolve a PR number — e.g.
     the workflow ran on `push` rather than `pull_request`, or `GITHUB_EVENT_PATH`
     doesn't point at a `pull_request` payload. Pass `--pr <number>` locally to
     test.

3. **Check the diff.json files:**
   - Same as GitLab: the reporter reads `*.diff.json` from the output directory;
     run `flow-delta` first to generate them. Zero changed diffs (including no
     `changedFlowAttributes`) is also a no-op, by design.

4. **Review the job logs:**
   - Errors are printed to stdout; look for GitHub API error codes (401, 403,
     404). Non-2xx responses are non-blocking reporter failures, not job
     failures, when the step is marked `continue-on-error: true`.

## Performance issues

### Symptom: The CLI is slow or uses a lot of memory

**Steps to optimize:**

1. **Use `--changed-only` in git mode:**
   - This filters the flow list to only those that actually changed
   - Saves both parsing and diffing time:
     ```bash
     npx tsx src/cli.ts --repo . --from main --to feature --path force-app --changed-only
     ```

2. **Profile the pipeline:**
   - Enable debug logging (if available in your fork)
   - Measure parser time vs. diff time vs. render time
   - If a specific flow is slow, it likely has many nodes/edges

3. **Consider splitting large flows:**
   - If a single flow has 500+ nodes, layout may be slow
   - This is not a bug; very large flows are complex
   - The renderer still produces valid output, just takes longer

4. **Check Node version:**
   - Node 18+ is required
   - Newer versions (20+) have better performance
   - Run `node --version` and upgrade if old

## Adding a fixture for your issue

Once you've isolated the problem, create a fixture so it doesn't regress:

1. **Save the before/after flows:**
   ```bash
   mkdir -p fixtures/diff/my_issue/
   cp before.xml fixtures/diff/my_issue/before.flow-meta.xml
   cp after.xml fixtures/diff/my_issue/after.flow-meta.xml
   ```

2. **Add a test row in `test/semantic-diff.test.ts`:**
   ```typescript
   {
     name: "my_issue",
     expectedSummary: { addedNodes: ..., removedNodes: ..., ... },
     assertion: (diff) => {
       // Assert the specific behavior you're testing
     }
   }
   ```

3. **Run the test:**
   ```bash
   npm test
   ```

4. **Commit the fixture:**
   - Fixtures are part of the test suite
   - Commit them so future changes don't break the expected behavior

## Asking for help

If you're stuck:

1. **Prepare reproduction steps:**
   - Minimal before/after flows or a fixture directory
   - The exact CLI command
   - Expected vs. actual output

2. **Gather debug info:**
   - Run with `--json` and include the `diff.json` output
   - Node version: `node --version`
   - OS: Windows/Mac/Linux

3. **Open an issue:**
   - GitHub: https://github.com/Syntax-Syllogism/flow-delta/issues
   - Include the steps, `diff.json`, and any error messages
