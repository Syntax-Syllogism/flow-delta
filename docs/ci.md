# GitLab CI integration

This project ships a second binary, `flow-delta-gitlab`, for merge-request
reporting. It does not recompute diffs; it reads the `*.diff.json` files emitted
by `flow-delta`, builds one sticky Markdown comment, and updates the existing MR
note in place.

## Sample pipeline

[`examples/gitlab-ci.yml`](../examples/gitlab-ci.yml) shows the supported
recipe:

- run on merge-request pipelines only,
- set `GIT_DEPTH: 0` so the base SHA is available,
- run `flow-delta` with `--changed-only`,
- keep the out directory as a job artifact,
- run `flow-delta-gitlab` after the diff step,
- mark the job `allow_failure: true` so a reporting hiccup does not block the MR.

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
the interactive HTML artifact for that flow. The artifact URL points at the job
artifact browse route under `CI_PROJECT_URL`.

When no `.diff.json` files contain a non-zero summary, the reporter exits
without creating a comment.

## Behavior

- A note authored by the reporter's token user and containing the marker is
  updated with `PUT`.
- Otherwise a new note is created with `POST`.
- Non-2xx API responses are surfaced as reporter failures only; the main MR job
  stays non-blocking.

For the pure helper functions and the API orchestration coverage, see
`test/gitlab-report.test.ts`.
