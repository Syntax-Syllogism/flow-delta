---
title: Documentation site
description: Build, author, and publish the FlowDelta documentation site.
---

# Documentation site

The Markdown in this directory is the source of truth for FlowDelta and FlexiPageDelta docs. The Astro Starlight project in `docs-site/` loads it directly. It never copies or generates files under `docs/`.

The published site is at `https://syntax-syllogism.com/flow-delta/docs/`. Reading the same Markdown on GitHub works just as well.

## Preview and build

Run the docs project from `docs-site/`:

```bash
cd docs-site
npm ci
npm run dev
```

The docs site needs Node `>=22.12.0`, regardless of what the root project supports. Check your Node version first.

`npm run build` makes the production build and validates links. `npm run preview` serves a finished build. Output goes to `docs-site/dist/`, which Git ignores. The build also checks that README maps to the index, internal links are rewritten, pinned URLs pass through unchanged, and nothing under `docs/` was modified.

`docs-site/astro.config.mjs` sets the public base path, the explicit sidebar, and the shared theme. `docs-site/src/content.config.ts` loads `../docs` and maps `README.md` to the site index. Keep both files thin. Shared Starlight behavior, theme styling, and Markdown link rewriting come from `@syntax-syllogism/docs-theme`. The shared favicon is committed as `docs-site/public/ss-wordmark.svg`, so fresh CI checkouts include it.

## Writing rules

- Every published page needs `title` and `description` frontmatter.
- Add each new guide to both `docs/README.md` and the sidebar in `docs-site/astro.config.mjs`, so it can be found in the repo and on the site.
- Link between files in this directory with relative `.md` links, anchors included. They work on GitHub, and the shared remark plugin rewrites them to site routes at build time.
- Links that leave `docs/` must be literal public GitHub blob URLs pinned to the current release tag, so they work from both GitHub and the site. The release CLI repoints them in the release commit. Don't replace them with relative paths or branch URLs.

## Publishing

`.github/workflows/docs.yml` calls the shared docs-publish workflow, and only for the `release` branch of the public `Syntax-Syllogism/flow-delta` repository. Pushes to the private repository skip the job. The reusable workflow builds this project and deploys only the generated `flow-delta/docs/` subtree to `Syntax-Syllogism/Syntax-Syllogism.github.io`.

The release configuration's `docsLinkBase` lets the release CLI keep source links consistent with the release tag. Build the docs locally before a release. A successful build of the root package doesn't validate this separate project.
