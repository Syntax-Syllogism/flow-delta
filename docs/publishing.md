---
title: Publishing and packaging
description: Build, package, and release FlowDelta to npm.
---

# Publishing and packaging

FlowDelta publishes as the npm package `@syntax-syllogism/flow-delta`.

## Build

`npm run build` runs [`scripts/build.mjs`](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.0/scripts/build.mjs), which bundles
the six CLI/reporting entrypoints into:

- `dist/cli.js`
- `dist/gitlab-report.js`
- `dist/github-report.js`
- `dist/flexipage-cli.js`
- `dist/flexipage-gitlab-report.js`
- `dist/flexipage-github-report.js`

All six files are emitted with a Node shebang and are marked executable.

The build leaves runtime dependencies external, so the published package still
loads `xml2js` and `elkjs` from npm rather than bundling them into the emitted
entrypoints.

## Package contents

The package manifest publishes:

- `dist/`
- `NOTICE`
- `LICENSE`
- `LICENSE-APACHE`
- `README.md`

The binary map is:

| Binary | Target |
|---|---|
| `flow-delta` | `dist/cli.js` |
| `flow-delta-gitlab` | `dist/gitlab-report.js` |
| `flow-delta-github` | `dist/github-report.js` |
| `flexipage-delta` | `dist/flexipage-cli.js` |
| `flexipage-delta-gitlab` | `dist/flexipage-gitlab-report.js` |
| `flexipage-delta-github` | `dist/flexipage-github-report.js` |

## Release checks

Run the checks in this order before publishing:

```bash
npm run typecheck
npm run build
npm test
npm pack --json
```

`npm run typecheck` is also wired into repository CI and `prepublishOnly`,
before the build and test steps. The packed tarball should include the six
`dist` entrypoints plus the licensing files above.

The release CLI keeps the pinned source links in these docs aligned with the
new release tag as part of the release commit.

The Apache-2.0 vendored parser requires `NOTICE` and `LICENSE-APACHE` to travel
with the npm package. See [vendoring.md](vendoring.md) for the license
provenance and the do-not-edit rule.
