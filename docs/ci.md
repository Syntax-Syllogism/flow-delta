# CI integration (GitLab + GitHub)

This project ships a second binary, `flow-delta-gitlab`, for merge-request
reporting. It does not recompute diffs; it reads the `*.diff.json` files emitted
by `flow-delta`, builds one sticky Markdown comment, and updates the existing MR
note in place.

## Sample pipeline

[`examples/gitlab-ci.yml`](../examples/gitlab-ci.yml) shows the supported
recipe:

- run on merge-request pipelines only,
- set `GIT_DEPTH: 0` so the base SHA is available,
- diff `$CI_MERGE_REQUEST_DIFF_BASE_SHA` against the source-branch HEAD (see
  [Choosing the `--to` ref](#choosing-the---to-ref) below),
- run `flow-delta` with `--changed-only`,
- keep the out directory as a job artifact,
- run `flow-delta-gitlab` after the diff step,
- mark the job `allow_failure: true` so a reporting hiccup does not block the MR.

### Choosing the `--to` ref

`--changed-only` runs a two-dot `git diff <from> <to>` and reports the flows that
differ between those two commits. To match GitLab's MR **Changed files** tab,
`<to>` must be the **source-branch HEAD** — the tip of the branch under review.

The trap is `$CI_COMMIT_SHA`. In a plain **detached** MR pipeline it *is* the
source-branch HEAD, so `--to "$CI_COMMIT_SHA"` works. But in a **merged results
pipeline** or **merge train**, `$CI_COMMIT_SHA` is a *synthetic* commit that
merges your source branch into the **latest target branch**. Diffing the base
against that merge commit pulls in every flow changed on target since the merge
base — i.e. flows from *other* merged MRs — which then appear in the report even
though they are not in this MR's changed-files list.

Use `$CI_MERGE_REQUEST_SOURCE_BRANCH_SHA` instead. GitLab populates it with the
real source-branch HEAD in merged-results and merge-train pipelines, and leaves
it empty in detached pipelines, so the fallback covers both:

```yaml
--from "$CI_MERGE_REQUEST_DIFF_BASE_SHA" \
--to   "${CI_MERGE_REQUEST_SOURCE_BRANCH_SHA:-$CI_COMMIT_SHA}"
```

To confirm which pipeline style a project uses, print the variables in the job:
`$CI_MERGE_REQUEST_SOURCE_BRANCH_SHA` is non-empty (and differs from
`$CI_COMMIT_SHA`) exactly when merged results or merge trains are in play.

The smoke harness in [`scripts/smoke-gitlab.ts`](../scripts/smoke-gitlab.ts)
uses the same shape to seed a dedicated sample repo, push a base `master`
branch plus a smoke/e2e feature branch, and open the MR automatically. It uses
`git` plus [`glab`](https://docs.gitlab.com/cli/), so make sure `glab auth
status` succeeds for the target GitLab host before running it.

Example:

```bash
npm run smoke:gitlab -- --remote-url <gitlab-repo-url>
```

The default local repo path is [`sample-project/`](../sample-project), which
the script turns into its own git repository for the smoke run.

## Inputs

The reporter reads these CI variables by default, with CLI overrides for local
testing:

| Variable | Purpose |
|---|---|
| `CI_API_V4_URL` | GitLab API base URL |
| `CI_PROJECT_ID` | Project id for the notes endpoint |
| `CI_MERGE_REQUEST_IID` | Merge request to comment on |
| `CI_PROJECT_URL` | Base for artifact browse URLs |
| `CI_JOB_ID` | Job whose artifacts hold the HTML |
| `FlowDelta_GITLAB_TOKEN` | Project or group access token with `api` scope |

The reporter expects the token to be masked in CI logs.

## Comment shape

The sticky comment starts with a hidden marker so the next run can find and
update it:

```md
<!-- FlowDelta:report -->
```

It then renders a short summary header, one row per changed flow, and a link to
the interactive HTML artifact for that flow. The table includes node counts,
edge counts, and a compact `Flow` column for flow-level attribute changes such as
`Deactivated (Active -> Draft)` or `Api Version, Run In Mode`. The artifact URL
points at the job artifact browse route under `CI_PROJECT_URL`.

When no `.diff.json` files contain a non-zero summary, the reporter exits without
creating a comment. `summary.changedFlowAttributes` participates in that decision,
so a pure flow-root change with no node/edge changes is still reported.

## Behavior

- A note authored by the reporter's token user and containing the marker is
  updated with `PUT`.
- Otherwise a new note is created with `POST`.
- Non-2xx API responses are surfaced as reporter failures only; the main MR job
  stays non-blocking.

For the pure helper functions and the API orchestration coverage, see
`test/gitlab-report.test.ts`.

## GitHub Actions

A third binary, `flow-delta-github`, brings the same reporting to GitHub pull
requests. It shares its comment/scan logic with the GitLab reporter (see
`src/ci/report-core.ts`); the only GitHub-specific pieces are the issue-comments
API calls and the artifact-URL scheme.

### Sample workflow

[`examples/github-actions.yml`](../examples/github-actions.yml) shows the
supported recipe:

- run on `pull_request`,
- grant `permissions: { contents: read, pull-requests: write }`,
- checkout with `fetch-depth: 0` so the base SHA is available,
- run `flow-delta` with `--changed-only`,
- upload the out directory as a job artifact,
- run `flow-delta-github` after the diff step, with `continue-on-error: true` so
  a reporting hiccup does not block the PR.

### Inputs

The reporter reads these `GITHUB_*` variables by default, with CLI overrides for
local testing:

| Variable | Purpose |
|---|---|
| `GITHUB_API_URL` | GitHub API base URL (default `https://api.github.com`) |
| `GITHUB_REPOSITORY` | `owner/repo` |
| PR number | from the `pull_request` event payload at `GITHUB_EVENT_PATH`, or `--pr` |
| `GITHUB_SERVER_URL` | Base for the artifact link (default `https://github.com`) |
| `GITHUB_RUN_ID` | Run whose artifacts hold the HTML |
| `GITHUB_SHA` | Commit shown in the comment footer |
| `GITHUB_TOKEN` | Needs `permissions: pull-requests: write` |
| `--artifact-urls <manifest.json>` | Optional map of `<artifact>.html` to a live-render URL |

### Comment shape and sticky behavior

Same marker, table, and `changedFlowAttributes` reporting rule as the GitLab
reporter (`isZeroSummary` lives in the shared core, so a pure deactivation
comments on both platforms). Sticky matching is **by marker only** — the
reporter never calls `GET /user`, because the Actions `GITHUB_TOKEN` is an
installation token that posts as `github-actions[bot]` and can't call that
endpoint. This is simpler than the GitLab reporter, not harder.

- No existing sticky comment → `POST` to `/repos/{owner}/{repo}/issues/{pr}/comments`.
- Existing sticky comment → `PATCH` `/repos/{owner}/{repo}/issues/comments/{id}`.
- No PR number resolvable (e.g. the workflow ran on `push`, not `pull_request`)
  → the reporter no-ops.
- Non-2xx API responses are surfaced as reporter failures only; pair the step
  with `continue-on-error: true` to keep the job non-blocking.
- Fork PRs: the default `GITHUB_TOKEN` on a `pull_request` event from a fork is
  read-only, so commenting fails there. Use `pull_request_target` with the
  attendant security caveats, or accept that fork-PR commenting needs elevated
  configuration.

### Artifact link (baseline)

The baseline links to the workflow run's artifacts page:
`${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`.
Viewing is **download-then-open** — GitHub Actions artifacts are login-gated
zips, not browsable files, so there is no per-file deep link the way GitLab's
job-artifact browse route provides one. Because FlowDelta's artifact is a
single self-contained HTML file with no external URLs, download-then-open is
the full interactive experience offline; no server is required to view it.

When `--artifact-urls <manifest.json>` is provided, the GitHub reporter reads a
JSON object shaped like `{ "My_Flow.html": "https://..." }`. A matching entry
wins for that flow; missing entries fall back to the workflow run's artifacts
page. Missing, empty, malformed, or non-object manifests are treated as empty,
and manifest values are ignored unless they are `http://` or `https://` strings.
The same manifest hook is intentionally generic so other reporters can adopt it
without changing the comment renderer.

### Live-render on private repos

The baseline above works on private repos with nothing but the workflow file.
If you want a reviewer to click straight into a live render instead of
downloading a zip, publish the self-contained HTML to storage you own and pass
the resulting URLs through `--artifact-urls`.

**Trust boundary (applies to every option below):** FlowDelta ships the CLI and
template code. Every credential is one *you* create; every server is
one *you* deploy in *your* infrastructure. FlowDelta-the-project holds no
token, runs no server, and never sees your repo or artifacts — this is
deliberately not the artifact.ci model of one central, tool-author-owned server
brokering access to many private repos.

Privacy comes from who can see the PR comment. A presigned URL or HMAC-signed
Worker URL is a bearer capability: on a private repo, only repo-read users see
the link; on a public repo, anyone can use it until it expires. Keep expiries
short for public demos.

#### Option A: R2 presigned URL

This is the no-server path. CI uploads each `flow-delta-out/*.html` file to
your Cloudflare R2 bucket with `content-type: text/html`, then generates an
R2/S3 presigned GET URL. SigV4 presigned URLs expire after at most seven days.

Use the same upload shape as Option B, but omit `ARTIFACT_BASE_URL` and
`ARTIFACT_HMAC_KEY` so `scripts/r2-publish.mjs` falls back to `aws s3 presign`:

```yaml
- name: Publish to R2 with presigned URLs
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
    R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
    R2_BUCKET: ${{ secrets.R2_BUCKET }}
    ARTIFACT_EXPIRES_IN_SECONDS: 86400
  run: node ./node_modules/@syntax-syllogism/flow-delta/scripts/r2-publish.mjs flow-delta-out "$GITHUB_REPOSITORY/${{ github.event.number }}/$GITHUB_SHA" > flow-delta-out/urls.json
- run: ./node_modules/.bin/flow-delta-github --in flow-delta-out --artifact-urls flow-delta-out/urls.json
```

#### Option B: Cloudflare Worker over R2

This is the stable-base-URL path used by the demo. CI uploads to R2 and signs a
Worker URL as:

```text
${ARTIFACT_BASE_URL}/${GITHUB_REPOSITORY}/${PR}/${GITHUB_SHA}/${stem}.html?exp=<unixSeconds>&sig=<hmac>
```

The HMAC is SHA-256 over `${key}:${exp}` using `ARTIFACT_HMAC_KEY`. The Worker
template in [`examples/cloudflare-worker/`](../examples/cloudflare-worker/)
recomputes that signature, rejects expired or tampered links, reads the object
through its R2 binding, and streams it with `content-type: text/html`.

One-time setup:

1. Install and authenticate Wrangler: `npm i -g wrangler && wrangler login`.
2. Copy [`examples/cloudflare-worker/`](../examples/cloudflare-worker/), set
   `bucket_name` in `wrangler.toml`, and deploy it.
3. Set the Worker secret: `wrangler secret put ARTIFACT_HMAC_KEY`.
4. Add GitHub secrets `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, and `ARTIFACT_HMAC_KEY` with the same HMAC value.
5. Add GitHub variable `ARTIFACT_BASE_URL` with the Worker URL.

The example workflow publishes by key
`${GITHUB_REPOSITORY}/${{ github.event.number }}/$GITHUB_SHA/${stem}.html`, so
reruns and stale PRs do not collide. It always keeps the baseline
`actions/upload-artifact` step as the zero-infra fallback.

The GitHub smoke harness in [`scripts/smoke-github.ts`](../scripts/smoke-github.ts)
creates or reuses `Syntax-Syllogism/flow-delta-example`, seeds fixture befores on
`main`, pushes fixture afters to a smoke branch, writes the Worker-backed
workflow, and opens the PR with `gh pr create`. It assumes the repo secrets and
Worker already exist; those manual owner setup steps are intentionally not
automated.

For the pure helper functions and the API orchestration coverage, see
`test/report-core.test.ts` and `test/github-report.test.ts`.
