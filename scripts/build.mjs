import { mkdirSync, chmodSync } from "node:fs";
import { build } from "esbuild";

await build({
  entryPoints: ["src/cli.ts", "src/ci/gitlab-report.ts"],
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node18",
  outdir: "dist",
  entryNames: "[name]",
  banner: {
    js: "#!/usr/bin/env node",
  },
});

mkdirSync("dist", { recursive: true });
chmodSync("dist/cli.js", 0o755);
chmodSync("dist/gitlab-report.js", 0o755);
