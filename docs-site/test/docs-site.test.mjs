import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { remarkRelativeMdLinks } from '@syntax-syllogism/docs-theme';

const docsSiteRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(docsSiteRoot);
const docsRoot = join(repositoryRoot, 'docs');
const distRoot = join(docsSiteRoot, 'dist');
const base = '/flow-delta/docs';

function filesWithExtension(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesWithExtension(path, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [path] : [];
  });
}

test('builds README as the site index and rewrites rendered internal links', () => {
  const indexHtml = readFileSync(join(distRoot, 'index.html'), 'utf8');

  assert.match(indexHtml, /href="\/flow-delta\/docs\/getting-started\/"/);
  assert.match(
    indexHtml,
    /href="\/flow-delta\/docs\/architecture\/#canonicalization-in-build-modelts"/,
  );
  assert.equal(indexHtml.includes('href="getting-started.md"'), false);
});

test('emits the shared-theme favicon asset', () => {
  const favicon = readFileSync(join(distRoot, 'ss-wordmark.svg'), 'utf8');

  assert.match(favicon, /Syntax &amp; Syllogism/);
});

test('rewrites anchored links from nested docs and preserves pinned source links', () => {
  const anchoredLink = {
    type: 'link',
    url: '../../architecture.md#canonicalization-in-build-modelts',
  };
  const pinnedSourceLink = {
    type: 'link',
    url: 'https://github.com/Syntax-Syllogism/flow-delta/blob/v0.7.1/LICENSE',
  };
  const tree = { type: 'root', children: [anchoredLink, pinnedSourceLink] };

  remarkRelativeMdLinks({ base, docsRoot })(tree, {
    path: join(docsRoot, 'nested', 'deeper', 'guide.md'),
  });

  assert.equal(
    anchoredLink.url,
    '/flow-delta/docs/architecture/#canonicalization-in-build-modelts',
  );
  assert.equal(
    pinnedSourceLink.url,
    'https://github.com/Syntax-Syllogism/flow-delta/blob/v0.7.1/LICENSE',
  );
});

test('keeps every pinned source URL in the generated site', () => {
  const source = filesWithExtension(docsRoot, '.md')
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  const pinnedUrlMatches = source.match(
    /https:\/\/github\.com\/Syntax-Syllogism\/flow-delta\/blob\/v[^/]+\/[^\s)]+/g,
  ) ?? [];
  const pinnedUrls = [...new Set(pinnedUrlMatches)];
  const renderedSite = filesWithExtension(distRoot, '.html')
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

  assert.equal(pinnedUrlMatches.length, 17);
  for (const url of pinnedUrls) {
    assert.match(url, /\/blob\/v[^/]+\//);
    assert.ok(renderedSite.includes(url), `Missing pinned source URL: ${url}`);
  }
});
