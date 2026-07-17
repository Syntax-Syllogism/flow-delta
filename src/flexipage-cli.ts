import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { readMetadataFromFile, readMetadataFromGit } from "./io/read-metadata.ts";
import { safeFileName } from "./util/file-name.ts";
import { isMainModule } from "./util/is-main-module.ts";
import { diffPage, type PageDiff } from "./flexipage/diff-page.ts";
import { parseFlexiPage } from "./flexipage/parse.ts";
import type { PageModel } from "./flexipage/page-model.ts";
import { renderOutline } from "./flexipage/render-outline.ts";

export interface FlexiPageCliOptions {
  old?: string;
  new?: string;
  from?: string;
  to?: string;
  repo?: string;
  path?: string;
  out?: string;
  json?: boolean;
  help?: boolean;
}

type ParsedOptions = FlexiPageCliOptions & { "changed-only"?: boolean };

const CLI_USAGE = `Usage:
  flexipage-delta --old <old.flexipage-meta.xml> --new <new.flexipage-meta.xml> [--out dir] [--json]
  flexipage-delta --from <ref> --to <ref> --repo <path> [--path <glob>] [--changed-only] [--out dir] [--json]`;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs({
    args: argv,
    options: {
      old: { type: "string" }, new: { type: "string" }, from: { type: "string" }, to: { type: "string" },
      repo: { type: "string" }, path: { type: "string" }, out: { type: "string" }, json: { type: "boolean" },
      "changed-only": { type: "boolean" }, help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });
  const options = parsed.values as ParsedOptions;
  if (options.help) { console.log(CLI_USAGE); return; }
  const outDir = resolve(options.out ?? "./flexipage-delta-out");
  mkdirSync(outDir, { recursive: true });
  try {
    if (options.old || options.new) {
      if (!options.old || !options.new) throw new Error("File mode requires both --old and --new");
      await runFileMode(options.old, options.new, outDir, Boolean(options.json));
      return;
    }
    if (options.from || options.to || options.repo || options.path) {
      if (!options.from || !options.to || !options.repo) throw new Error("Git mode requires --from, --to, and --repo");
      await runGitMode(options.repo, options.from, options.to, options.path ?? "force-app/**/*.flexipage-meta.xml", outDir, Boolean(options.json), Boolean(options["changed-only"]));
      return;
    }
    throw new Error("Specify either --old/--new or --from/--to/--repo");
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

async function runFileMode(oldPath: string, newPath: string, outDir: string, writeJson: boolean): Promise<void> {
  await writeArtifacts(await parseFlexiPage(readMetadataFromFile(oldPath)), await parseFlexiPage(readMetadataFromFile(newPath)), outDir, writeJson);
}

async function runGitMode(repo: string, from: string, to: string, pattern: string, outDir: string, writeJson: boolean, changedOnly: boolean): Promise<void> {
  let failed = false;
  for (const filePath of discoverGitFiles(repo, from, to, pattern, changedOnly)) {
    try {
      const oldXml = readMetadataFromGit(repo, from, filePath);
      const newXml = readMetadataFromGit(repo, to, filePath);
      await writeArtifacts(oldXml ? await parseFlexiPage(oldXml) : emptyPage(), newXml ? await parseFlexiPage(newXml) : emptyPage(), outDir, writeJson, filePath);
    } catch (error) {
      failed = true;
      console.error(`${filePath}: ${(error as Error).message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

function emptyPage(): PageModel {
  return { pageName: "(unknown)", header: {}, regions: [] };
}

async function writeArtifacts(oldModel: PageModel, newModel: PageModel, outDir: string, writeJson: boolean, sourcePath?: string): Promise<void> {
  const diff = diffPage(oldModel, newModel);
  const stem = safeFileName(diff.pageName === "(unknown)" ? sourcePath ?? "flexipage" : diff.pageName);
  writeFileSync(join(outDir, `${stem}.html`), renderOutline(diff, { template: newModel.header.template }), "utf8");
  if (writeJson) writeFileSync(join(outDir, `${stem}.diff.json`), JSON.stringify(diff, null, 2), "utf8");
  console.log(`${diff.pageName}: components +${diff.summary.addedComponents}/−${diff.summary.removedComponents}/~${diff.summary.modifiedComponents}; regions +${diff.summary.addedRegions}/−${diff.summary.removedRegions}/~${diff.summary.modifiedRegions}; page attributes ${diff.summary.changedPageAttributes}`);
}

function discoverGitFiles(repo: string, from: string, to: string, pattern: string, changedOnly: boolean): string[] {
  const files = changedOnly
    ? gitFiles(repo, ["diff", "--name-only", "--diff-filter=ACMRD", from, to, "--", pattern])
    : [...new Set([...gitFiles(repo, ["ls-tree", "-r", "--name-only", from]), ...gitFiles(repo, ["ls-tree", "-r", "--name-only", to])])];
  const matcher = globToRegExp(pattern.replaceAll("\\", "/"));
  return files.filter((file) => matcher.test(file)).sort();
}

function gitFiles(repo: string, args: string[]): string[] {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split("\n").map((line) => line.trim()).filter(Boolean);
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") { if (pattern[index + 1] === "*") { source += ".*"; index += 1; } else source += "[^/]*"; continue; }
    if (char === "?") { source += "[^/]"; continue; }
    source += "\\^$+?.()|{}[]".includes(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`);
}

if (isMainModule(import.meta.url)) void main();
