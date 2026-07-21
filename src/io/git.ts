import { execFileSync } from "node:child_process";

export type GitRunner = (repo: string, args: readonly string[]) => string;

export const runGit: GitRunner = (repo, args) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

export function isMissingGitPathError(error: unknown): boolean {
  const details = error as { stderr?: unknown; message?: unknown };
  const message = String(details.stderr ?? details.message ?? error ?? "");
  return (
    message.includes("does not exist in") ||
    message.includes("exists on disk, but not in") ||
    message.includes("pathspec") ||
    message.includes("fatal: path")
  );
}
