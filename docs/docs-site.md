---
title: Documentation site
description: Build, author, and publish the FlowDelta documentation site.
---

# Documentation site

The Markdown in this directory is the source of truth for FlowDelta and
FlexiPageDelta documentation. The Astro Starlight project in `docs-site/` loads
that Markdown directly; it does not copy or generate source files under
`docs/`.

The published site is served at
`https://syntax-syllogism.com/flow-delta/docs/`. GitHub repository browsing
remains a first-class way to read the same Markdown.

## Local preview and build

Install and run the isolated docs project from `docs-site/`:

```bash
cd docs-site
npm ci
npm run dev
```

The docs site requires Node `>=22.12.0`, independently of the root project's
Node support. Check or switch Node before running these commands.

Use `npm run build` for the production build and link-validation gate, or
`npm run preview` to serve an already-built site. The build output is
`docs-site/dist/` and is ignored by Git. The build also verifies README-to-index
routing, rewritten internal links, pass-through pinned URLs, and that it did
not modify Markdown under `docs/`.

`docs-site/astro.config.mjs` owns the public base path, explicit sidebar, and
shared theme integration. `docs-site/src/content.config.ts` loads `../docs` and
maps `README.md` to the site index. Keep these files thin: shared Starlight
behavior, theme styling, and Markdown-link rewriting come from
`@syntax-syllogism/docs-theme`. The shared-theme favicon is committed as
`docs-site/public/ss-wordmark.svg` so fresh CI checkouts include the deployed
asset.

## Authoring rules

Every published Markdown page needs `title` and `description` frontmatter.
Add a new guide to both `docs/README.md` and the explicit sidebar in
`docs-site/astro.config.mjs` so it is discoverable in the repository and on the
site.

Keep links between files in this directory as relative `.md` links, including
anchors. They work when browsing the repository, and the shared remark plugin
rewrites them to the corresponding site routes during the build.

Links that leave `docs/` must be literal public GitHub blob URLs pinned to the
current release tag. This lets the same link work from GitHub and the published
site. The release CLI repoints those pinned links in the release commit; do not
replace them with relative paths or branch URLs.

## Publication

`.github/workflows/docs.yml` calls the shared docs-publish workflow only for
the public `Syntax-Syllogism/flow-delta` repository's `release` branch.
Private-repository pushes skip the job entirely. The reusable workflow builds
this project and deploys only the generated `flow-delta/docs/` subtree in
`Syntax-Syllogism/Syntax-Syllogism.github.io`.

The release configuration's `docsLinkBase` lets the release CLI keep source
links self-consistent with the release tag. Build the docs locally before a
release; a successful root package build alone does not validate this separate
project.
