---
title: Vendored parser (Apache-2.0)
description: Provenance and maintenance policy for the vendored Flow parser.
---

# Vendored parser (Apache-2.0)

FlowDelta doesn't parse Flow XML itself. The parser is **vendored** from Google's Flow Lens project (`google-flow-lens`) and sits, unmodified, at:

- `src/parser/flow_parser.ts`
- `src/parser/flow_types.ts`

## Names

**FlowDelta** is this project and its semantic diff and render pipeline. **Google Flow Lens** (`google-flow-lens`) means only the upstream project the parser comes from. Don't use "Flow Lens" to describe FlowDelta's own code or behavior.

## Where it came from

- Upstream: Google Flow Lens (`google-flow-lens`), Apache License 2.0.
- Vendored commit: the exact upstream SHA is in `NOTICE` at the repo root.
- The vendored files keep their original Apache-2.0 headers, and `NOTICE` records the attribution.

## Don't edit it

Treat `src/parser/` as read-only. `test/parser.test.ts` (the upstream suite, ported to `node:test`) pins its behavior and shows it runs the same under Node. Editing it would diverge from upstream, break that guarantee, and make any future re-sync harder. FlowDelta-specific behavior belongs in the layers on top: `model/`, `diff/`, and `render/`.

## Why only the parser

A spike showed the parser is runtime-agnostic. It imports only `xml2js` and its own types, with no Deno APIs, so it copies into a Node and TypeScript project as-is. We didn't adopt the upstream diff and render layers. FlowDelta has its own normalized model, canonicalization, edge-aware diff, per-property deltas, and interactive HTML, which cover gaps upstream doesn't.

## Licensing

FlowDelta is mixed-license. FlowDelta's own code is MIT (`LICENSE`). The Google Flow Lens parser is Apache-2.0. We aren't relicensing the parser as MIT.

To comply with Apache-2.0 when redistributing, including on npm, all of these must travel together:

- the original Apache-2.0 headers in `src/parser/*` (don't strip them): §4(c);
- [`LICENSE-APACHE`](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/LICENSE-APACHE), the full license text: §4(a);
- [`NOTICE`](https://github.com/Syntax-Syllogism/flow-delta/blob/v0.9.1/NOTICE), with attribution and the upstream commit: §4(d).

The parser is vendored verbatim, so there are no modified-file notices under §4(b). If that ever changes, mark the modified files prominently.
