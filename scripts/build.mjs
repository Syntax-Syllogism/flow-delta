import { mkdirSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  absWorkingDir: repoRoot,
  entryPoints: ["./src/cli.ts", "./src/ci/gitlab-report.ts", "./src/ci/github-report.ts"],
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node18",
  outdir: join(repoRoot, "dist"),
  entryNames: "[name]",
  banner: {
    js: "#!/usr/bin/env node",
  },
});

const distDir = join(repoRoot, "dist");
mkdirSync(distDir, { recursive: true });
chmodSync(join(distDir, "cli.js"), 0o755);
chmodSync(join(distDir, "gitlab-report.js"), 0o755);
chmodSync(join(distDir, "github-report.js"), 0o755);
