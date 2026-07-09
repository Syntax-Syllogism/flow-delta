# Publishing and packaging

FlowDelta publishes as the npm package `@syntax-syllogism/flow-delta`.

## Build

`npm run build` runs [`scripts/build.mjs`](../scripts/build.mjs), which bundles
the CLI entrypoints into:

- `dist/cli.js`
- `dist/gitlab-report.js`
- `dist/github-report.js`

All three files are emitted with a Node shebang and are marked executable.

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

## Release checks

The repository treats `npm test` as the functional gate and `npm pack --json` as
the publishability smoke check. The packed tarball should include the three
`dist` entrypoints plus the licensing files above.

The Apache-2.0 vendored parser requires `NOTICE` and `LICENSE-APACHE` to travel
with the npm package. See [vendoring.md](vendoring.md) for the license
provenance and the do-not-edit rule.
