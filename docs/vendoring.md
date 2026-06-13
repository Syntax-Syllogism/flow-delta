# Vendored parser (Apache-2.0)

FlowDelta does not parse Flow XML itself. The parser is **vendored** from
Google's upstream Flow Lens project (`google-flow-lens`) and lives, unmodified,
at:

- `src/parser/flow_parser.ts`
- `src/parser/flow_types.ts`

## Naming distinction

**FlowDelta** is this project and its semantic diff/render pipeline. **Google
Flow Lens** (`google-flow-lens`) refers only to the upstream project from which
the parser is vendored. Do not use Flow Lens as a name for FlowDelta-authored
code or behavior.

## Provenance

- Upstream: Google Flow Lens (`google-flow-lens`), Apache License 2.0.
- Vendored commit: see `NOTICE` at the repo root (records the exact upstream SHA).
- The vendored files retain their original Apache-2.0 headers; `NOTICE` records
  the attribution.

## Do not edit

Treat `src/parser/` as read-only. Its behavior is pinned by `test/parser.test.ts`
(the upstream suite, ported to `node:test`), which proves the parser runs
identically under Node. Edits would diverge from upstream, break that guarantee,
and complicate any future re-sync. All FlowDelta-specific behavior belongs in the
layers built *on top* of the parser (`model/`, `diff/`, `render/`).

## Why vendor only the parser

A spike confirmed the parser is runtime-agnostic — it imports only `xml2js` plus
its own type module, with zero Deno APIs, so it copies into a Node/TypeScript
project verbatim. The upstream diff/render layers were **not** adopted; FlowDelta
provides its own normalized model, canonicalization, edge-aware diff, per-property
deltas, and interactive HTML — the gaps upstream doesn't cover.

## License interaction

FlowDelta is a mixed-license project: MIT and Apache-2.0.
FlowDelta-authored code is MIT (`LICENSE`); the Google Flow Lens parser is
Apache-2.0. The project is **not** relicensing the parser as MIT.

To stay compliant with Apache-2.0 when redistributing (including npm publish),
all of the following must travel together:

- `src/parser/*` original Apache-2.0 headers (do not strip) — §4(c).
- [`LICENSE-APACHE`](../LICENSE-APACHE), the full Apache-2.0 text — §4(a).
- [`NOTICE`](../NOTICE), attribution + upstream commit — §4(d).

The parser is vendored verbatim, so there are no "modified file" notices to add
under §4(b); if that ever changes, mark the modified files prominently.
