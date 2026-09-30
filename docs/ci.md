---
title: CI integration (GitLab + GitHub)
description: Configure FlowDelta and FlexiPageDelta reporting in CI.
---

# CI integration (GitLab + GitHub)

The package ships a second binary, `flow-delta-gitlab`, for merge-request reporting. It reads the `*.diff.json` files that `flow-delta` already wrote, builds one sticky Markdown comment, and updates the existing MR note in place.

## Sample pipeline

[`examples/gitlab-ci.yml`](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/examples/gitlab-ci.yml) is the supported recipe. It:

- runs on merge-request pipelines only;
- sets `GIT_DEPTH: 0` so the base SHA is available;
- diffs `$CI_MERGE_REQUEST_DIFF_BASE_SHA` against the source-branch HEAD (see [Choosing the `--to` ref](#choosing-the---to-ref));
- runs `flow-delta` with `--changed-only`;
- keeps the out directory as a job artifact;
- runs `flow-delta-gitlab` after the diff step;
- sets `allow_failure: true`, so a reporting hiccup doesn't block the MR.

### Choosing the `--to` ref

`--changed-only` runs a two-dot `git diff <from> <to>` and reports the flows that differ between those commits. To match GitLab's **Changed files** tab, `<to>` must be the **source-branch HEAD**, the tip of the branch under review.

The trap is `$CI_COMMIT_SHA`. In a plain **detached** MR pipeline it _is_ the source-branch HEAD, so `--to "$CI_COMMIT_SHA"` works. In a **merged results pipeline** or **merge train**, though, `$CI_COMMIT_SHA` is a _synthetic_ commit that merges your source branch into the **latest target branch**. Diffing the base against it pulls in every flow changed on the target since the merge base. Flows from _other_ merged MRs then appear in your report, even though they're not in this MR's changed files.

Use `$CI_MERGE_REQUEST_SOURCE_BRANCH_SHA` instead. GitLab sets it to the real source-branch HEAD in merged-results and merge-train pipelines, and leaves it empty in detached pipelines, so this fallback covers both:

```yaml
--from "$CI_MERGE_REQUEST_DIFF_BASE_SHA" \
--to   "${CI_MERGE_REQUEST_SOURCE_BRANCH_SHA:-$CI_COMMIT_SHA}"
```

To check which style a project uses, print the variables in the job. `$CI_MERGE_REQUEST_SOURCE_BRANCH_SHA` is non-empty, and differs from `$CI_COMMIT_SHA`, exactly when merged results or merge trains are in use.

The smoke harness, [`scripts/smoke-gitlab.ts`](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/scripts/smoke-gitlab.ts), uses the same shape. It seeds a dedicated sample repo, pushes a base `master` branch and a smoke/e2e feature branch, and opens the MR. It uses `git` and [`glab`](https://docs.gitlab.com/cli/), so `glab auth status` must succeed for the target GitLab host before you run it.

```bash
npm run smoke:gitlab -- --remote-url <gitlab-repo-url>
```

The default local repo path is `sample-project/`, which the script turns into its own git repository for the smoke run.

## Inputs

The reporter reads these CI variables by default. CLI flags override them for local testing.

| Variable                 | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `CI_API_V4_URL`          | GitLab API base URL                            |
| `CI_PROJECT_ID`          | Project id for the notes endpoint              |
| `CI_MERGE_REQUEST_IID`   | Merge request to comment on                    |
| `CI_PROJECT_URL`         | Base for artifact browse URLs                  |
| `CI_JOB_ID`              | Job whose artifacts hold the HTML              |
| `FlowDelta_GITLAB_TOKEN` | Project or group access token with `api` scope |

Mask the token in CI logs. The reporter expects that.

## The comment

The sticky comment starts with a hidden marker, so the next run can find and update it:

```md
<!-- FlowDelta:report -->
```

Then comes a short summary header, one row per changed flow, and a `View` link to that flow's interactive HTML. The table columns are:

```md
| Flow | Nodes (+/-/~) | Edges (+/-) | Flow Attributes (+/-/~) | Diff |
```

- Node counts cover added, removed, and modified nodes.
- Edge counts cover added and removed edges. Edges have no modified state.
- Flow Attributes is a `+0 / -0 / ~N` count of flow-root property changes, such as `status`, `apiVersion`, or `runInMode`. Header fields always exist, so additions and removals are always `0`.
- The artifact URL points at the job-artifact browse route under `CI_PROJECT_URL`.

To preview the Markdown for a before and after pair without the full smoke harness (no tarball build, no sample repo, no push), use [`scripts/preview-comment.ts`](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/scripts/preview-comment.ts):

```bash
npm run preview:comment -- --product flow \
  --old fixtures/diff/add_node/before.flow-meta.xml \
  --new fixtures/diff/add_node/after.flow-meta.xml
```

Pass `--product flexipage` with `*.flexipage-meta.xml` files to preview the FlexiPageDelta comment. Repeat `--old` and `--new` in pairs to get several rows in one comment. `--commit-sha` and `--artifact-url-base` are optional.

If no `.diff.json` has a non-zero summary, the reporter exits without commenting. `summary.changedFlowAttributes` counts toward that check, so a change to only a flow-root attribute is still reported.

## What the reporter does

- A note from the reporter's token user that contains the marker is updated with `PUT`.
- Otherwise it creates a new note with `POST`.
- Non-2xx API responses fail the reporter only. The main MR job stays non-blocking.

`test/gitlab-report.test.ts` covers the helper functions and the API orchestration.

## GitHub Actions

A third binary, `flow-delta-github`, brings the same reporting to GitHub pull requests. It shares its comment and scan logic with the GitLab reporter (`src/ci/report-core.ts`). Only the issue-comments API calls and the artifact URL scheme are GitHub-specific.

### Sample workflow

[`examples/github-actions.yml`](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/examples/github-actions.yml) is the supported recipe. It:

- runs on `pull_request`;
- grants `permissions: { contents: read, pull-requests: write }`;
- checks out with `fetch-depth: 0` so the base SHA is available;
- runs `flow-delta` with `--changed-only`;
- uploads the out directory as a job artifact;
- runs `flow-delta-github` afterward with `continue-on-error: true`, so a reporting hiccup doesn't block the PR.

### Inputs

The reporter reads these `GITHUB_*` variables by default. CLI flags override them for local testing.

| Variable                          | Purpose                                                                 |
| --------------------------------- | ----------------------------------------------------------------------- |
| `GITHUB_API_URL`                  | GitHub API base URL (default `https://api.github.com`)                  |
| `GITHUB_REPOSITORY`               | `owner/repo`                                                            |
| PR number                         | from the `pull_request` event payload at `GITHUB_EVENT_PATH`, or `--pr` |
| `GITHUB_SERVER_URL`               | Base for the artifact link (default `https://github.com`)               |
| `GITHUB_RUN_ID`                   | Run whose artifacts hold the HTML                                       |
| `GITHUB_SHA`                      | Commit shown in the comment footer                                      |
| `GITHUB_TOKEN`                    | Needs `permissions: pull-requests: write`                               |
| `--artifact-urls <manifest.json>` | Optional map of `<artifact>.html` to a live-render URL                  |

### The comment, and how it stays sticky

The marker, table, and `changedFlowAttributes` rule are the same as GitLab's. `isZeroSummary` lives in the shared core, so a pure deactivation produces a comment on both platforms. The reporter finds its comment **by marker only**. It never calls `GET /user`, because the Actions `GITHUB_TOKEN` is an installation token that posts as `github-actions[bot]` and can't call that endpoint. That makes the GitHub reporter simpler than the GitLab one.

- No existing sticky comment: `POST` to `/repos/{owner}/{repo}/issues/{pr}/comments`.
- An existing sticky comment: `PATCH` `/repos/{owner}/{repo}/issues/comments/{id}`.
- No PR number can be found (for example, the workflow ran on `push`): the reporter does nothing.
- Non-2xx API responses fail the reporter only. Pair the step with `continue-on-error: true` to keep the job non-blocking.
- **Fork PRs:** the default `GITHUB_TOKEN` on a fork's `pull_request` event is read-only, so commenting fails. Use `pull_request_target` and accept its security caveats, or accept that fork PRs need elevated configuration to get comments.

### Artifact link

By default, the comment links to the workflow run's artifacts page: `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`.

Viewing is **download, then open**. GitHub Actions artifacts are login-gated zips, not browsable files, so there's no per-file deep link like GitLab's job-artifact browse route. FlowDelta's artifact is one self-contained HTML file with no external URLs, so download-then-open gives the full interactive experience offline. No server is needed.

With `--artifact-urls <manifest.json>`, the reporter reads a JSON object shaped like `{ "My_Flow.html": "https://..." }`. A matching entry wins for that flow, and flows without an entry fall back to the run's artifacts page. A missing, empty, malformed, or non-object manifest counts as empty, and values that aren't `http://` or `https://` strings are ignored. The manifest hook is deliberately generic so other reporters can adopt it without changing the comment renderer.

### Live renders on private repos

The default works on private repos with nothing but the workflow file. If you'd rather have reviewers click into a live render than download a zip, publish the HTML to storage you own and pass the URLs in with `--artifact-urls`.

**Trust boundary (applies to every option below):** FlowDelta ships the CLI and template code. Every credential is one _you_ create, and every server is one _you_ deploy in _your_ infrastructure. FlowDelta as a project holds no token, runs no server, and never sees your repo or artifacts.

Privacy comes from who can see the PR comment. A presigned URL or HMAC-signed Worker URL is a bearer capability. On a private repo, only users with read access see the link. On a public repo, anyone can use it until it expires, so keep expiries short for public demos.

#### Option A: R2 presigned URLs

This needs no server. CI uploads each `flow-delta-out/*.html` file to your Cloudflare R2 bucket with `content-type: text/html`, then generates an R2/S3 presigned GET URL. SigV4 presigned URLs expire after at most seven days.

Use the same upload step as Option B, but leave out `ARTIFACT_BASE_URL` and `ARTIFACT_HMAC_KEY`, so `scripts/r2-publish.mjs` falls back to `aws s3 presign`:

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

This gives you a stable base URL, and it's what the demo uses. CI uploads to R2 and signs a Worker URL:

```text
${ARTIFACT_BASE_URL}/${GITHUB_REPOSITORY}/${PR}/${GITHUB_SHA}/${stem}.html?exp=<unixSeconds>&sig=<hmac>
```

The HMAC is SHA-256 over `${key}:${exp}`, using `ARTIFACT_HMAC_KEY`. The Worker template in [`examples/cloudflare-worker/`](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/examples/cloudflare-worker/) recomputes the signature, rejects expired or tampered links, reads the object through its R2 binding, and streams it with `content-type: text/html`.

One-time setup:

1. Install and sign in to Wrangler: `npm i -g wrangler && wrangler login`.
2. Copy [`examples/cloudflare-worker/`](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/examples/cloudflare-worker/), set `bucket_name` in `wrangler.toml`, and deploy it.
3. Set the Worker secret: `wrangler secret put ARTIFACT_HMAC_KEY`.
4. Add the GitHub secrets `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `ARTIFACT_HMAC_KEY` (the same HMAC value).
5. Add the GitHub variable `ARTIFACT_BASE_URL` with the Worker URL.

The example workflow publishes under the key `${GITHUB_REPOSITORY}/${{ github.event.number }}/$GITHUB_SHA/${stem}.html`, so reruns and stale PRs don't collide. It always keeps the default `actions/upload-artifact` step as a fallback that needs no infrastructure.

The GitHub smoke harness, [`scripts/smoke-github.ts`](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/scripts/smoke-github.ts), creates or reuses `Syntax-Syllogism/flow-delta-example`, seeds fixture "before" files on `main`, pushes fixture "after" files to a smoke branch, writes the Worker-backed workflow, and opens the PR with `gh pr create`. It assumes the repo secrets and the Worker already exist. Those one-time owner setup steps aren't automated on purpose.

`test/report-core.test.ts` and `test/github-report.test.ts` cover the helper functions and the API orchestration.

## FlexiPageDelta reporting

The matching reporters are `flexipage-delta-gitlab` and `flexipage-delta-github`. They read FlexiPage `*.diff.json` files from the directory given to `--in` (or `FLOW_LENS_OUT_DIR`) and use the shared comment builder in `src/ci/report-core.ts`.

FlexiPage comments use the marker `<!-- FlexiPageDelta:report -->` and this table:

```md
| Page | Components (+/–/~) | Regions (+/–/~) | Page Attributes (+/-/~) | Diff |
```

Component counts cover added, removed, and modified items. Region counts cover added, removed, and region `type` or `mode` changes. A template-only change is non-zero and still produces a comment. GitLab uses the job-artifact browse path. GitHub uses the workflow-run artifact URL, with the same optional `--artifact-urls` manifest as the Flow reporter.

The FlexiPage entrypoints take the same platform credentials and environment as their Flow counterparts. Without `--in`, they read `flexipage-delta-out`. See [flexipage.md](flexipage.md) for the product-specific artifact and CLI behavior.
