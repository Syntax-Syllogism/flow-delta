import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { FlowDiff } from "../diff/diff-model.ts";
import type { PageDiff } from "../flexipage/diff-page.ts";
import { humanizePath } from "../render/snapshot-panel.ts";
import { safeFileName } from "../util/file-name.ts";

export const DEFAULT_MARKER = "<!-- FlowDelta:report -->";
export const FLEXIPAGE_MARKER = "<!-- FlexiPageDelta:report -->";

export interface FlowResult {
  flowName: string;
  summary: Pick<FlowDiff["summary"], "addedNodes" | "removedNodes" | "modifiedNodes" | "addedEdges" | "removedEdges" | "changedFlowAttributes">;
  flowChanges?: FlowDiff["flowChanges"];
  artifactUrl: string;
}

export interface FlexiPageResult {
  pageName: string;
  summary: Pick<PageDiff["summary"], "addedComponents" | "removedComponents" | "modifiedComponents" | "addedRegions" | "removedRegions" | "modifiedRegions" | "changedPageAttributes">;
  pageChanges?: PageDiff["pageChanges"];
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
  return buildProductComment(results, {
    marker: DEFAULT_MARKER,
    heading: (count) => `## 🔍 FlowDelta — ${count} flow(s) changed`,
    empty: "_No Flow changes in this MR._",
    columns: "| Flow | +nodes | -nodes | ~nodes | +/-edges | Flow | Diff |",
    separator: "| --- | ---: | ---: | ---: | ---: | --- | --- |",
    sortName: (result) => result.flowName,
    row: (result) => {
      const flowSummary = escapeTableCell(formatFlowChanges(result.flowChanges));
      return `| ${escapeTableCell(result.flowName)} | ${result.summary.addedNodes} | ${result.summary.removedNodes} | ${result.summary.modifiedNodes} | ${result.summary.addedEdges} / ${result.summary.removedEdges} | ${flowSummary} | [Open interactive diff](${result.artifactUrl}) |`;
    },
  }, opts);
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
    .filter((value): value is NonNullable<typeof value> => value !== null);
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

export interface CommentVocabulary<T> {
  marker: string;
  heading: (count: number) => string;
  empty: string;
  columns: string;
  separator: string;
  sortName: (result: T) => string;
  row: (result: T) => string;
}

export function buildProductComment<T>(results: T[], vocabulary: CommentVocabulary<T>, opts: { marker?: string; commitSha?: string } = {}): string {
  const sorted = [...results].sort((left, right) => vocabulary.sortName(left).localeCompare(vocabulary.sortName(right)));
  const lines = [opts.marker ?? vocabulary.marker, "", vocabulary.heading(sorted.length), ""];
  if (sorted.length === 0) lines.push(vocabulary.empty);
  else lines.push(vocabulary.columns, vocabulary.separator, ...sorted.map(vocabulary.row));
  if (opts.commitSha) lines.push("", `Commit: \`${opts.commitSha.slice(0, 7)}\``);
  return lines.join("\n");
}

export function isZeroPageSummary(summary: FlexiPageResult["summary"]): boolean {
  return summary.addedComponents === 0 && summary.removedComponents === 0 && summary.modifiedComponents === 0
    && summary.addedRegions === 0 && summary.removedRegions === 0 && summary.modifiedRegions === 0 && summary.changedPageAttributes === 0;
}

export function readFlexiPageResults(inputDir: string): FlexiPageResultWithStem[] {
  return readdirSync(inputDir)
    .filter((file) => file.endsWith(".diff.json"))
    .map((file) => {
      const diff = JSON.parse(readFileSync(join(inputDir, file), "utf8")) as PageDiff;
      if (isZeroPageSummary(diff.summary)) return null;
      return { pageName: diff.pageName, summary: diff.summary, pageChanges: diff.pageChanges, stem: safeFileName(diff.pageName) };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);
}

export interface FlexiPageResultWithStem extends Omit<FlexiPageResult, "artifactUrl"> {
  stem: string;
}

export function buildFlexiPageComment(results: FlexiPageResult[], opts: { marker?: string; commitSha?: string } = {}): string {
  return buildProductComment(results, {
    marker: FLEXIPAGE_MARKER,
    heading: (count) => `## 🔍 FlexiPageDelta — ${count} page(s) changed`,
    empty: "_No FlexiPage changes in this MR._",
    columns: "| Page | Components (+/–/~) | Regions (+/–/~) | Page attributes | Diff |",
    separator: "| --- | ---: | ---: | --- | --- |",
    sortName: (result) => result.pageName,
    row: (result) => {
      const callout = result.pageChanges?.find((change) => change.path === "template");
      const attributes = callout ? `Template: ${formatValue(callout.before)} → ${formatValue(callout.after)}` : String(result.summary.changedPageAttributes);
      return `| ${escapeTableCell(result.pageName)} | +${result.summary.addedComponents} / −${result.summary.removedComponents} / ~${result.summary.modifiedComponents} | +${result.summary.addedRegions} / −${result.summary.removedRegions} / ~${result.summary.modifiedRegions} | ${escapeTableCell(attributes)} | [Open interactive diff](${result.artifactUrl}) |`;
    },
  }, opts);
}

function formatValue(value: unknown): string {
  return value === undefined ? "(missing)" : String(value);
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
