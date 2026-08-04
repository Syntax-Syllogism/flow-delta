import { fileURLToPath } from 'node:url';
import { defineCollection } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { docsGlobLoader } from '@syntax-syllogism/docs-theme';

const docsRoot = fileURLToPath(new URL('../../docs', import.meta.url));

export const collections = {
  docs: defineCollection({
    loader: docsGlobLoader({ base: docsRoot }),
    schema: docsSchema(),
  }),
};
