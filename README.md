# FlowDelta

<img width="1638" height="1392" alt="Screencast Demo" src="https://github.com/user-attachments/assets/b3f5f248-485a-4f62-9955-805a1b57186b" />

[![npm](https://img.shields.io/npm/v/@syntax-syllogism/flow-delta.svg)](https://www.npmjs.com/package/@syntax-syllogism/flow-delta)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Stop reviewing Salesforce Flow changes as raw XML.** FlowDelta parses two
versions of a `.flow-meta.xml`, diffs them by stable node name, and renders a
self-contained interactive HTML artifact (plus `diff.json`) that shows added /
deleted / modified / unchanged nodes and edges with per-property deltas.

Inspired by Google's [Flow Lens](https://github.com/google/flow-lens), with a
focus on CI review workflows for GitLab merge requests and GitHub pull requests.
We also opted for our own HTML output over plantuml, graphviz, or mermaid.

The package also ships [FlexiPageDelta](docs/flexipage.md), a sibling tool for
semantic diffs of `.flexipage-meta.xml` metadata. It renders an offline
hierarchical outline and provides `flexipage-delta`,
`flexipage-delta-gitlab`, and `flexipage-delta-github` binaries.

- [Sample GitLab project with artifacts](https://gitlab.com/j.p.richter/flow-delta-example/-/merge_requests/)
- [Sample GitHub project with artifacts](https://github.com/Syntax-Syllogism/flow-delta-example/pulls)

## Quick Start

No install required:

```bash
npx @syntax-syllogism/flow-delta --old before.flow-meta.xml --new after.flow-meta.xml --out ./flow-delta-out
```

Open the generated `.html` file in a browser to see the interactive diff
shown above.

Prefer a permanent install?

```bash
npm install -g @syntax-syllogism/flow-delta
flow-delta --old before.flow-meta.xml --new after.flow-meta.xml --out ./flow-delta-out
```

## Usage

See [docs/cli.md](docs/cli.md) for full file-mode and git-mode options.

For FlexiPage metadata, use the sibling CLI documented in
[docs/flexipage.md](docs/flexipage.md):

```bash
npx flexipage-delta --old before.flexipage-meta.xml --new after.flexipage-meta.xml --out ./flexipage-delta-out --json
```

```bash
# File mode — compare two local files
npx @syntax-syllogism/flow-delta --old before.flow-meta.xml --new after.flow-meta.xml --out ./flow-delta-out --json

# Git mode — compare two refs in a repo
npx @syntax-syllogism/flow-delta --repo /path/to/sfdx-repo --from main --to feature-branch --path 'force-app/**/*.flow-meta.xml' --out ./flow-delta-out
```

CI reporters read the generated `flow-delta-out/*.diff.json` files and post a
sticky review comment. Install the package first (these binaries don't map
1:1 to the package name, so plain `npx` won't resolve them):

```bash
npm install @syntax-syllogism/flow-delta
npx flow-delta-gitlab --in flow-delta-out
npx flow-delta-github --in flow-delta-out
```

The GitHub reporter can also consume `--artifact-urls <manifest.json>` for
user-owned live-render links, such as R2 presigned URLs or Cloudflare
Worker-backed URLs. See [docs/ci.md](docs/ci.md) for GitLab/GitHub workflow
recipes, private-repo artifact viewing, and smoke harnesses.

## Development

Working from a clone of this repo? Runs as a TypeScript CLI via `tsx`, no
build step:

```bash
npm install
npm test                 # parser + semantic diff / render / CLI suites
npm run render:fixtures  # render all Flow + FlexiPage fixtures
npm run render:fixtures -- flow       # Flow only
npm run render:fixtures -- flexipage  # FlexiPage only
npx tsx src/cli.ts --old before.flow-meta.xml --new after.flow-meta.xml --out ./flow-delta-out --json
```

Architecture, testing, and the vendored-parser policy are documented in
[docs/](docs/) (start with [docs/architecture.md](docs/architecture.md)).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

[MIT](LICENSE) © Jacob Richter — applies to FlowDelta-authored code.

FlowDelta also vendors the Flow parser (`src/parser/`) from Google's
[Flow Lens (`google-flow-lens`)](https://github.com/google/flow-lens), which is
licensed under the [Apache License 2.0](LICENSE-APACHE). Those files retain their
original headers; see [`NOTICE`](NOTICE) for attribution and provenance, and
[docs/vendoring.md](docs/vendoring.md) for the policy.
