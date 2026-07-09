import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { FlowDiff } from "../diff/diff-model.ts";
import { humanizePath } from "../render/snapshot-panel.ts";
import { safeFileName } from "../util/file-name.ts";

export const DEFAULT_MARKER = "<!-- FlowDelta:report -->";

export interface FlowResult {
  flowName: string;
  summary: Pick<FlowDiff["summary"], "addedNodes" | "removedNodes" | "modifiedNodes" | "addedEdges" | "removedEdges" | "changedFlowAttributes">;
  flowChanges?: FlowDiff["flowChanges"];
  artifactUrl: string;
}

export interface ReportNote {
  id: number;
  body: string;
  author?: {
    id?: number;
    username?: string;
  };
}

export function buildComment(results: FlowResult[], opts: { marker?: string; commitSha?: string } = {}): string {
  const marker = opts.marker ?? DEFAULT_MARKER;
  const sorted = [...results].sort((left, right) => left.flowName.localeCompare(right.flowName));
  const lines = [marker, "", `## 🔍 FlowDelta — ${sorted.length} flow(s) changed`, ""];

  if (sorted.length === 0) {
    lines.push("_No Flow changes in this MR._");
  } else {
    lines.push("| Flow | +nodes | -nodes | ~nodes | +/-edges | Flow | Diff |");
    lines.push("| --- | ---: | ---: | ---: | ---: | --- | --- |");
    for (const result of sorted) {
      const flowSummary = escapeTableCell(formatFlowChanges(result.flowChanges));
      lines.push(
        `| ${escapeTableCell(result.flowName)} | ${result.summary.addedNodes} | ${result.summary.removedNodes} | ${result.summary.modifiedNodes} | ${result.summary.addedEdges} / ${result.summary.removedEdges} | ${flowSummary} | [Open interactive diff](${result.artifactUrl}) |`,
      );
    }
  }

  if (opts.commitSha) {
    lines.push("", `Commit: \`${opts.commitSha.slice(0, 7)}\``);
  }

  return lines.join("\n");
}

export function readResults(inputDir: string): Array<{
  flowName: string;
  summary: FlowDiff["summary"];
  flowChanges?: FlowDiff["flowChanges"];
  stem: string;
}> {
  return readdirSync(inputDir)
    .filter((file) => file.endsWith(".diff.json"))
    .map((file) => {
      const diff = JSON.parse(readFileSync(join(inputDir, file), "utf8")) as FlowDiff;
      if (isZeroSummary(diff.summary)) {
        return null;
      }

      return {
        flowName: diff.flowName,
        summary: diff.summary,
        flowChanges: diff.flowChanges,
        stem: safeFileName(diff.flowName),
      };
    })
    .filter((value): value is { flowName: string; summary: FlowDiff["summary"]; flowChanges?: FlowDiff["flowChanges"]; stem: string } => value !== null);
}

export function loadArtifactUrls(path?: string): Record<string, string> {
  if (!path || !existsSync(path)) {
    return {};
  }
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && (entry[1].startsWith("https://") || entry[1].startsWith("http://")),
      ),
    );
  } catch {
    return {};
  }
}

export function resolveArtifactUrl(stem: string, urls: Record<string, string>, fallback: string): string {
  return urls[`${stem}.html`] ?? fallback;
}

export function isZeroSummary(summary: FlowDiff["summary"]): boolean {
  return (
    summary.addedNodes === 0 &&
    summary.removedNodes === 0 &&
    summary.modifiedNodes === 0 &&
    summary.addedEdges === 0 &&
    summary.removedEdges === 0 &&
    summary.changedFlowAttributes === 0
  );
}

export function findStickyNote(notes: ReportNote[], marker: string, authorId?: number): ReportNote | undefined {
  return notes.find((note) => note.body.includes(marker) && (authorId === undefined || note.author?.id === authorId));
}

export function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("`", "\\`").replace(/\r?\n/g, "<br>");
}

function formatFlowChanges(flowChanges: FlowDiff["flowChanges"]): string {
  if (!flowChanges || flowChanges.length === 0) {
    return "";
  }
  const status = flowChanges.find((change) => change.path === "status");
  if (status) {
    return formatStatusChange(status.before, status.after);
  }
  return flowChanges.map((change) => humanizePath(change.path)).join(", ");
}

function formatStatusChange(before: unknown, after: unknown): string {
  if (before === "Active" && after !== "Active") {
    return `Deactivated (${String(before)} -> ${String(after)})`;
  }
  if (before !== "Active" && after === "Active") {
    return `Activated (${String(before)} -> ${String(after)})`;
  }
  return `Status: ${String(before)} -> ${String(after)}`;
}
