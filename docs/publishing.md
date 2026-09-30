---
title: Publishing and packaging
description: Build, package, and release FlowDelta to npm.
---

# Publishing and packaging

FlowDelta is published to npm as `@syntax-syllogism/flow-delta`.

## Build

`npm run build` runs [`scripts/build.mjs`](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/scripts/build.mjs), which bundles the six CLI and reporter entrypoints:

- `dist/cli.js`
- `dist/gitlab-report.js`
- `dist/github-report.js`
- `dist/flexipage-cli.js`
- `dist/flexipage-gitlab-report.js`
- `dist/flexipage-github-report.js`

Each file gets a Node shebang and is marked executable. Runtime dependencies stay external, so the published package loads `xml2js` and `elkjs` from npm instead of bundling them.

## What's in the package

The manifest publishes:

- `dist/`
- `NOTICE`
- `LICENSE`
- `LICENSE-APACHE`
- `README.md`

The binaries map like this:

| Binary | Target |
|---|---|
| `flow-delta` | `dist/cli.js` |
| `flow-delta-gitlab` | `dist/gitlab-report.js` |
| `flow-delta-github` | `dist/github-report.js` |
| `flexipage-delta` | `dist/flexipage-cli.js` |
| `flexipage-delta-gitlab` | `dist/flexipage-gitlab-report.js` |
| `flexipage-delta-github` | `dist/flexipage-github-report.js` |

## Before you release

Run these in order:

```bash
npm run typecheck
npm run build
npm test
npm pack --json
```

`npm run typecheck` also runs in repository CI and in `prepublishOnly`, ahead of the build and tests. The packed tarball should contain the six `dist` entrypoints and the license files above.

The release CLI updates the pinned source links in these docs to the new release tag as part of the release commit.

The vendored parser is Apache-2.0, so `NOTICE` and `LICENSE-APACHE` must ship with the package. See [Vendoring policy](vendoring.md) for provenance and the do-not-edit rule.
