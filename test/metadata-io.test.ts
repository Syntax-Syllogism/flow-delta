import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverGitMetadataFiles } from "../src/io/discover-git-metadata.ts";
import type { GitRunner } from "../src/io/git.ts";
import { readMetadataFromGit } from "../src/io/read-metadata.ts";

test("shared Git discovery unions refs, normalizes paths, deduplicates, and sorts", () => {
  const calls: string[][] = [];
  const runner: GitRunner = (_repo, args) => {
    calls.push([...args]);
    return args.at(-1) === "from-ref"
      ? "force-app/main/deep/Z.xml\nforce-app\\main\\deep\\A.xml\n"
      : "force-app/main/deep/A.xml\nforce-app/main/deep/B.xml\n";
  };

  const files = discoverGitMetadataFiles(
    {
      repo: "repo",
      fromRef: "from-ref",
      toRef: "to-ref",
      pattern: "force-app/**/*.xml",
      changedOnly: false,
    },
    runner,
  );

  assert.deepEqual(files, [
    "force-app/main/deep/A.xml",
    "force-app/main/deep/B.xml",
    "force-app/main/deep/Z.xml",
  ]);
  assert.deepEqual(calls, [
    ["ls-tree", "-r", "--name-only", "from-ref"],
    ["ls-tree", "-r", "--name-only", "to-ref"],
  ]);
});

test("shared Git discovery preserves literal, star, double-star, and question-mark matching", () => {
  const runner: GitRunner = (_repo, args) => {
    assert.equal(args[0], "ls-tree");
    return [
      "flows/a.xml",
      "flows/ab.xml",
      "flows/nested/a.xml",
      "flows/nested/ab.xml",
    ].join("\n");
  };

  assert.deepEqual(
    discoverGitMetadataFiles(
      { repo: "repo", fromRef: "ref", toRef: "ref", pattern: "flows/*.xml", changedOnly: false },
      runner,
    ),
    ["flows/a.xml", "flows/ab.xml"],
  );
  assert.deepEqual(
    discoverGitMetadataFiles(
      { repo: "repo", fromRef: "ref", toRef: "ref", pattern: "flows/**/*.xml", changedOnly: false },
      runner,
    ),
    ["flows/nested/a.xml", "flows/nested/ab.xml"],
  );
  assert.deepEqual(
    discoverGitMetadataFiles(
      { repo: "repo", fromRef: "ref", toRef: "ref", pattern: "flows/nested/?.xml", changedOnly: false },
      runner,
    ),
    ["flows/nested/a.xml"],
  );
  assert.deepEqual(
    discoverGitMetadataFiles(
      { repo: "repo", fromRef: "ref", toRef: "ref", pattern: "flows\\a.xml", changedOnly: false },
      runner,
    ),
    ["flows/a.xml"],
  );
});

test("shared Git discovery uses changed-only diff output and normalizes its result", () => {
  const calls: string[][] = [];
  const runner: GitRunner = (_repo, args) => {
    calls.push([...args]);
    assert.equal(args[0], "diff");
    return "flows\\added.flow-meta.xml\nflows/changed.flow-meta.xml\n";
  };

  const files = discoverGitMetadataFiles(
    {
      repo: "repo",
      fromRef: "old",
      toRef: "new",
      pattern: "flows/*.flow-meta.xml",
      changedOnly: true,
    },
    runner,
  );

  assert.deepEqual(files, ["flows/added.flow-meta.xml", "flows/changed.flow-meta.xml"]);
  assert.deepEqual(calls, [
    ["diff", "--name-only", "--diff-filter=ACMRD", "old", "new", "--", "flows/*.flow-meta.xml"],
  ]);
});

test("shared metadata reader returns null for missing paths and propagates unrelated Git errors", () => {
  const missingError = Object.assign(new Error("git show failed"), {
    stderr: Buffer.from("fatal: path 'flows/removed.flow-meta.xml' does not exist in 'new'"),
  });
  const missingRunner: GitRunner = () => {
    throw missingError;
  };
  assert.equal(readMetadataFromGit("repo", "new", "flows/removed.flow-meta.xml", missingRunner), null);

  const unrelatedError = new Error("fatal: not a git repository");
  const unrelatedRunner: GitRunner = () => {
    throw unrelatedError;
  };
  assert.throws(
    () => readMetadataFromGit("repo", "new", "flows/file.flow-meta.xml", unrelatedRunner),
    unrelatedError,
  );
});
