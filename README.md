# FlowDelta

A semantic, visual diff for Salesforce Flows: parse two versions of a
`.flow-meta.xml`, diff them by stable node name, and render a self-contained
interactive HTML artifact (plus `diff.json`) that shows added / deleted /
modified / unchanged nodes and edges with per-property deltas.

## Usage

Runs as a TypeScript CLI via `tsx` (no build step). See [docs/cli.md](docs/cli.md)
for full file-mode and git-mode options.

```bash
npx tsx src/cli.ts --old before.flow-meta.xml --new after.flow-meta.xml --out ./flow-delta-out --json
```

## Development

```bash
npm install
npm test                 # parser + semantic diff / render / CLI suites
npm run render:fixtures  # render every diff fixture to flow-delta-out/fixtures/
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
