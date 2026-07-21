import { existsSync, readFileSync } from "node:fs";
import { isMissingGitPathError, runGit, type GitRunner } from "./git.ts";

export function readMetadataFromFile(path: string): string {
  if (!path.endsWith(".xml")) {
    throw new Error(`Expected an XML file, got ${path}`);
  }
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return readFileSync(path, "utf8");
}

export function readMetadataFromGit(
  repo: string,
  ref: string,
  filePath: string,
  runner: GitRunner = runGit,
): string | null {
  try {
    return runner(repo, ["show", `${ref}:${filePath}`]);
  } catch (error) {
    if (isMissingGitPathError(error)) {
      return null;
    }
    throw error;
  }
}
