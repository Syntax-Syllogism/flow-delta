import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import {
  remarkRelativeMdLinks,
  starlightPreset,
} from '@syntax-syllogism/docs-theme';
import { fileURLToPath } from 'node:url';

const BASE = '/flow-delta/docs';
const DOCS_ROOT = fileURLToPath(new URL('../docs', import.meta.url));

export default defineConfig({
  site: 'https://syntax-syllogism.com',
  base: BASE,
  outDir: './dist',
  trailingSlash: 'always',
  markdown: {
    processor: unified({
      remarkPlugins: [[remarkRelativeMdLinks, { base: BASE, docsRoot: DOCS_ROOT }]],
    }),
  },
  integrations: [
    starlight({
      ...starlightPreset({
        title: 'FlowDelta',
        base: BASE,
        toolSlug: 'flow-delta',
        publicRepo: 'Syntax-Syllogism/flow-delta',
      }),
      sidebar: [
        {
          label: 'Quick start',
          items: ['index', 'getting-started', 'salesforce-flow-primer'],
        },
        {
          label: 'Using FlowDelta',
          items: ['cli', 'metadata-io', 'ci'],
        },
        {
          label: 'Understanding the system',
          items: ['data-model', 'architecture', 'render', 'flexipage'],
        },
        {
          label: 'Extending and customizing',
          items: ['section-schemas', 'extending-node-types', 'publishing'],
        },
        {
          label: 'Development',
          items: ['testing', 'debugging', 'vendoring', 'docs-site'],
        },
      ],
    }),
    starlightLinksValidator(),
  ],
});
