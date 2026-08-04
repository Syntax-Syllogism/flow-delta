import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsSiteRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(docsSiteRoot);
const docsRoot = join(repositoryRoot, 'docs');
const astroCli = join(docsSiteRoot, 'node_modules', 'astro', 'bin', 'astro.mjs');

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

function snapshotDocs() {
  return new Map(
    markdownFiles(docsRoot).map((path) => [
      relative(docsRoot, path),
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    ]),
  );
}

const beforeBuild = snapshotDocs();
const result = spawnSync(process.execPath, [astroCli, 'build'], {
  cwd: docsSiteRoot,
  stdio: 'inherit',
});

if (result.status !== 0) process.exit(result.status ?? 1);

const afterBuild = snapshotDocs();
if (JSON.stringify([...beforeBuild]) !== JSON.stringify([...afterBuild])) {
  throw new Error('Docs-site build modified source Markdown under docs/.');
}
