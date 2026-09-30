---
title: Shared metadata and Git input
description: Local and Git metadata discovery contracts for both CLIs.
---

# Shared metadata and Git input

FlowDelta and FlexiPageDelta keep their own policies and pipelines, but they share one small boundary: reading metadata from disk or Git. That boundary runs Git, reads a metadata file at a ref, and discovers paths. It knows nothing about how a Flow or FlexiPage is parsed, diffed, rendered, or reported.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/io/read-metadata.ts` | Reads an XML file synchronously, or a metadata path with `git show <ref>:<path>`. |
| `src/io/git.ts` | The default synchronous Git adapter, the injectable `GitRunner` port, and classification of "missing at ref" errors. |
| `src/io/discover-git-metadata.ts` | Finds metadata paths from both refs or from the changed-path diff, normalizes separators, applies the matcher, and returns sorted, unique paths. |

## Reading

`readMetadataFromFile(path)` requires an `.xml` path. It reports a missing local file as an error and returns the contents as UTF-8 text.

`readMetadataFromGit(repo, ref, filePath)` returns the XML from `git -C <repo> show <ref>:<filePath>`. If the path doesn't exist at that ref, it returns `null`. Any other Git failure is rethrown. Each product pipeline uses `null` to build its own empty model for added or deleted metadata.

Both Git-facing functions accept the small `GitRunner` port in tests. The default adapter is the only place that calls `execFileSync("git", ...)`.

## Discovery

`discoverGitMetadataFiles({ repo, fromRef, toRef, pattern, changedOnly })` follows these rules:

- **Full-tree mode** lists files at both refs and unions them, so additions and deletions stay visible.
- **`changedOnly` mode** runs `git diff --name-only --diff-filter=ACMRD <from> <to> -- <pattern>` and then applies the same matcher.
- Git path separators are normalized to `/`, and results are de-duplicated and sorted.
- Patterns support literal paths, `*` within one path segment, `**` across segments, and `?` for one non-separator character. Brackets and other glob syntax are treated literally. There's no glob dependency.

Each CLI keeps its own argument policy. Flow Git mode still requires `--path`. FlexiPage Git mode defaults to `force-app/**/*.flexipage-meta.xml` when `--path` is omitted. Each CLI also keeps its own parser, empty-model factory, artifact naming, summaries, and per-file error and exit-code handling.

## Tests and limits

`test/metadata-io.test.ts` is the shared contract suite. It covers matching, normalization, union and changed-only discovery, deterministic output, and missing-versus-unrelated Git errors. Product-level Git tests stay in `test/semantic-diff.test.ts` and `test/flexipage-delta.test.ts`, including each CLI's path policy.

When you change this boundary, keep the two product pipelines separate. Don't expand the glob syntax, change Salesforce org retrieval, or add a runtime dependency.
