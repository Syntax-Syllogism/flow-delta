# FlowDelta

<img width="1638" height="1392" alt="Screencast Demo" src="https://github.com/user-attachments/assets/b3f5f248-485a-4f62-9955-805a1b57186b" />

[![npm](https://img.shields.io/npm/v/@syntax-syllogism/flow-delta.svg)](https://www.npmjs.com/package/@syntax-syllogism/flow-delta)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Stop reviewing Salesforce Flow changes as raw XML.** FlowDelta compares two versions of a `.flow-meta.xml` file by stable node name. It produces a self-contained interactive HTML page, plus a `diff.json`, showing which nodes and edges were added, deleted, modified, or left alone, with per-property changes.

It's inspired by Google's [Flow Lens](https://github.com/google/flow-lens) and built for CI review of GitLab merge requests and GitHub pull requests. We render our own HTML instead of using PlantUML, Graphviz, or Mermaid.

Lightning pages get the same treatment. The package also ships [FlexiPageDelta](docs/flexipage.md), which diffs `.flexipage-meta.xml` files: regions, components, and facets, shown as an interactive outline with an optional wireframe so you can see *where* on the page something changed. The `flexipage-delta`, `flexipage-delta-gitlab`, and `flexipage-delta-github` binaries install alongside the Flow ones.

See it in action:

- [Sample GitLab project with artifacts](https://gitlab.com/j.p.richter/flow-delta-example/-/merge_requests/)
- [Sample GitHub project with artifacts](https://github.com/Syntax-Syllogism/flow-delta-example/pulls)

## Quick start

Run it without installing:

```bash
npx @syntax-syllogism/flow-delta --old before.flow-meta.xml --new after.flow-meta.xml --out ./flow-delta-out
```

Open the generated `.html` file in a browser.

To render a single Flow as it is now, use an as-built snapshot:

```bash
npx @syntax-syllogism/flow-delta --as-built --file My_Flow.flow-meta.xml --out ./flow-delta-out
```

To install it permanently:

```bash
npm install -g @syntax-syllogism/flow-delta
flow-delta --old before.flow-meta.xml --new after.flow-meta.xml --out ./flow-delta-out
```

For Lightning pages:

```bash
npx flexipage-delta --old before.flexipage-meta.xml --new after.flexipage-meta.xml --out ./flexipage-delta-out
```

## Usage

[docs/cli.md](docs/cli.md) lists every option for diff mode and as-built snapshots. [docs/flexipage.md](docs/flexipage.md) covers the FlexiPage CLI, its outline and wireframe output, and CI reporting.

```bash
# File mode: compare two local files
npx @syntax-syllogism/flow-delta --old before.flow-meta.xml --new after.flow-meta.xml --out ./flow-delta-out --json

# Git mode: compare two refs in a repo
npx @syntax-syllogism/flow-delta --repo /path/to/sfdx-repo --from main --to feature-branch --path 'force-app/**/*.flow-meta.xml' --out ./flow-delta-out

# FlexiPage, with JSON output
npx flexipage-delta --old before.flexipage-meta.xml --new after.flexipage-meta.xml --out ./flexipage-delta-out --json
```

### CI reporting

The CI reporters read the `flow-delta-out/*.diff.json` files and post a sticky review comment. Install the package first. These binaries don't match the package name, so plain `npx` can't find them:

```bash
npm install @syntax-syllogism/flow-delta
npx flow-delta-gitlab --in flow-delta-out
npx flow-delta-github --in flow-delta-out
```

FlexiPageDelta has matching reporters. Use `flexipage-delta-gitlab` or `flexipage-delta-github` and point `--in` at `flexipage-delta-out`.

The GitHub reporter also accepts `--artifact-urls <manifest.json>` for live-render links you host yourself, such as R2 presigned URLs or Cloudflare Worker URLs. [docs/ci.md](docs/ci.md) has workflow recipes for GitLab and GitHub, private-repo artifact viewing, and smoke tests.

## Development

From a clone, FlowDelta runs as a TypeScript CLI through `tsx`. There's no build step:

```bash
npm install
npm test                 # parser, semantic diff, render, and CLI suites
npm run render:fixtures  # render all Flow and FlexiPage fixtures
npm run render:fixtures -- flow       # Flow only
npm run render:fixtures -- flexipage  # FlexiPage only
npx tsx src/cli.ts --old before.flow-meta.xml --new after.flow-meta.xml --out ./flow-delta-out --json
```

For architecture, testing, and the vendored-parser policy, start with [docs/architecture.md](docs/architecture.md). The full index is in [docs/](docs/).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

[MIT](LICENSE) © Jacob Richter. This covers the code FlowDelta's authors wrote.

FlowDelta also vendors the Flow parser (`src/parser/`) from Google's [Flow Lens](https://github.com/google/flow-lens), which is licensed under the [Apache License 2.0](LICENSE-APACHE). Those files keep their original headers. See [`NOTICE`](NOTICE) for attribution and provenance, and [docs/vendoring.md](docs/vendoring.md) for the policy.
