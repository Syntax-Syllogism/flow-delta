import { runGit, type GitRunner } from "./git.ts";

export interface DiscoverGitMetadataFilesOptions {
  repo: string;
  fromRef: string;
  toRef: string;
  pattern: string;
  changedOnly: boolean;
}

export function discoverGitMetadataFiles(
  options: DiscoverGitMetadataFilesOptions,
  runner: GitRunner = runGit,
): string[] {
  const matcher = createPathMatcher(options.pattern);
  const files = options.changedOnly
    ? listChangedGitFiles(options, runner)
    : [
        ...listGitTree(options.repo, options.fromRef, runner),
        ...listGitTree(options.repo, options.toRef, runner),
      ];

  return [...new Set(files.map(normalizePath))].filter(matcher).sort();
}

function listGitTree(repo: string, ref: string, runner: GitRunner): string[] {
  return splitLines(runner(repo, ["ls-tree", "-r", "--name-only", ref]));
}

function listChangedGitFiles(
  options: DiscoverGitMetadataFilesOptions,
  runner: GitRunner,
): string[] {
  return splitLines(
    runner(options.repo, [
      "diff",
      "--name-only",
      "--diff-filter=ACMRD",
      options.fromRef,
      options.toRef,
      "--",
      options.pattern,
    ]),
  );
}

function splitLines(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function createPathMatcher(pattern: string): (path: string) => boolean {
  const normalized = normalizePath(pattern);
  if (!hasGlob(normalized)) {
    return (path) => path === normalized;
  }
  const regex = globToRegExp(normalized);
  return (path) => regex.test(path);
}

function hasGlob(value: string): boolean {
  // The supported glob subset is *, **, and ?; brackets remain literal characters.
  return /[*?]/.test(value);
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    if ("\\^$+?.()|{}[]".includes(char)) {
      source += `\\${char}`;
      continue;
    }
    source += char;
  }
  return new RegExp(`${source}$`);
}
