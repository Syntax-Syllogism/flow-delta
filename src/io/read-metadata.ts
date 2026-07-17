import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export function readMetadataFromFile(path: string): string {
  if (!path.endsWith(".xml")) {
    throw new Error(`Expected an XML file, got ${path}`);
  }
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return readFileSync(path, "utf8");
}

export function readMetadataFromGit(repo: string, ref: string, filePath: string): string | null {
  try {
    return execFileSync("git", ["-C", repo, "show", `${ref}:${filePath}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const message = String((error as { stderr?: Buffer; message?: string }).stderr ?? (error as Error).message ?? "");
    if (
      message.includes("does not exist in") ||
      message.includes("exists on disk, but not in") ||
      message.includes("pathspec") ||
      message.includes("fatal: path")
    ) {
      return null;
    }
    throw error;
  }
}
