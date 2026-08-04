---
title: Shared metadata and Git input
description: Local and Git metadata discovery contracts for both CLIs.
---

# Shared metadata and Git input

FlowDelta and FlexiPageDelta keep their product policies and semantic pipelines
separate, but they share the boundary that reads metadata from disk or Git.
This boundary is intentionally small: it owns external Git execution,
metadata-at-a-ref reads, and Git path discovery. It does not know how a Flow or
FlexiPage is parsed, diffed, rendered, or reported.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/io/read-metadata.ts` | Read an XML file synchronously or read a metadata path with `git show <ref>:<path>`. |
| `src/io/git.ts` | Provide the default synchronous Git adapter, the injectable `GitRunner` port, and missing-at-ref error classification. |
| `src/io/discover-git-metadata.ts` | Discover metadata paths from both refs or from the changed-path diff, normalize separators, apply the supported matcher, and return sorted unique paths. |

## Reader contract

`readMetadataFromFile(path)` requires an `.xml` path, reports a missing local
file as an error, and returns the file contents as UTF-8 text.

`readMetadataFromGit(repo, ref, filePath)` returns the XML text from
`git -C <repo> show <ref>:<filePath>`. A path that is absent at that ref returns
`null`; unrelated Git failures are rethrown. The product pipeline uses `null`
to construct its own empty model for added or deleted metadata.

Both Git-facing functions accept the small `GitRunner` port in tests. The
default adapter remains the only place that calls `execFileSync("git", ...)`.

## Discovery contract

`discoverGitMetadataFiles({ repo, fromRef, toRef, pattern, changedOnly })` uses
the following rules:

- Full-tree mode lists files from both refs and unions them, so additions and
  deletions remain visible.
- `changedOnly` mode uses
  `git diff --name-only --diff-filter=ACMRD <from> <to> -- <pattern>` before
  applying the same matcher.
- Git path separators are normalized to `/`; results are de-duplicated and
  sorted deterministically.
- Supported patterns are literal paths, `*` within one path segment, `**`
  across path segments, and `?` for one non-separator character. Brackets and
  other glob syntax are literal characters; no general glob dependency is used.

The product CLIs retain their own argument policy. Flow Git mode still requires
`--path`, while FlexiPage Git mode defaults to
`force-app/**/*.flexipage-meta.xml` when `--path` is omitted. They also retain
their own parsers, empty-model factories, artifact naming, summaries, and
per-file error/exit-code handling.

## Tests and change boundaries

`test/metadata-io.test.ts` is the shared contract suite. It covers matching,
normalization, union and changed-only discovery, deterministic output, and
missing-versus-unrelated Git errors. Product-level Git tests remain in
`test/semantic-diff.test.ts` and `test/flexipage-delta.test.ts`, including each
CLI's path policy.

Changes to this boundary should preserve the separate product pipelines and
should not expand glob syntax, alter Salesforce org retrieval, or add a runtime
dependency.
