import type { SectionSchema } from "./section-schemas.ts";

export interface SnapshotPanelNode {
  status: "added" | "deleted" | "modified" | "unchanged" | "present";
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

interface RenderOptions {
  showUnchanged: boolean;
  nodeStatus: SnapshotPanelNode["status"];
  suppressChangeColumn?: boolean;
}

interface RenderedSection {
  name: string;
  html: string;
  count: number;
}

interface RenderedValue {
  html: string;
  changed: boolean;
  count: number;
}

interface RowCell {
  before: unknown;
  after: unknown;
  changed: boolean;
}

interface TableRow {
  idx: number;
  kind: "added" | "removed" | "modified" | "unchanged";
  cells: Record<string, RowCell>;
}

const LONG_TEXT_THRESHOLD = 160;
const COLLECTION_KEY_NAMES = [
  "assignmentItems",
  "choiceReferences",
  "choices",
  "conditions",
  "customErrorMessages",
  "dataTypeMappings",
  "fields",
  "filters",
  "inputAssignments",
  "inputParameters",
  "outputParameters",
  "outputAssignments",
  "processMetadataValues",
  "rules",
  "scheduledPaths",
  "sortOptions",
  "stageSteps",
  "steps",
  "storeOutputParameters",
  "transformValues",
  "valueMappings",
  "waitEvents",
];
const COLLECTION_KEYS = new Set(COLLECTION_KEY_NAMES);

export function renderNodePanelBody(node: SnapshotPanelNode, schemas: SectionSchema[] = []): string {
  if (node.status === "unchanged") {
    return "<div class='empty'>No property changes.</div>";
  }

  const before = node.status === "added" || node.status === "present" ? undefined : node.before;
  const after = node.status === "deleted" ? undefined : node.after;
  const options = { showUnchanged: node.status !== "modified", nodeStatus: node.status };
  const sections = renderSections(before, after, schemas || [], options);
  if (!sections.length) {
    return "<div class='empty'>No configuration.</div>";
  }

  return sections.map((section, index) => {
    const open = node.status === "modified" || node.status === "present" || index === 0 ? " open" : "";
    return "<details class='detail-section snapshot-section " + node.status + "'" + open + "><summary>"
      + escapeHtml(section.name) + " <span class='section-count'>(" + section.count + ")</span></summary>"
      + "<div class='section-body'>" + section.html + "</div></details>";
  }).join("");
}

function renderSections(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  schemas: SectionSchema[],
  options: RenderOptions,
): RenderedSection[] {
  const sections: RenderedSection[] = [];
  const owned = new Set<string>();
  for (const schema of schemas) {
    for (const path of schema.paths) owned.add(path);
    const rendered = renderSchemaSection(before, after, schema, options);
    if (rendered) sections.push(rendered);
  }

  const keys = unionKeys(before, after).filter((key) => !ownsAny(owned, key));
  const settingsRows: string[] = [];
  let settingsCount = 0;
  const nestedSections: RenderedSection[] = [];

  for (const key of keys) {
    const childBefore = getField(before, key);
    const childAfter = getField(after, key);
    const childChanged = hasChange(childBefore, childAfter, key);
    const scalar = scalarPair(childBefore, childAfter);
    if (scalar) {
      if (options.showUnchanged || childChanged) {
        settingsRows.push(scalarRow(key, scalar.before, scalar.after, statusOf(childBefore, childAfter), options.nodeStatus));
      }
      if (childChanged) settingsCount += 1;
      continue;
    }

    const rendered = renderValue(getField(before, key), getField(after, key), {
      ...options,
      label: humanizePath(key),
      pathKey: key,
      depth: 0,
    });
    if (rendered.html) {
      nestedSections.push({ name: humanizePath(key), html: rendered.html, count: rendered.count });
    }
  }

  if (settingsRows.length) {
    sections.push({
      name: "Settings",
      html: "<table class='snapshot-kv'><tbody>" + settingsRows.join("") + "</tbody></table>",
      count: settingsCount,
    });
  }

  sections.push(...nestedSections);
  return sections;
}

function renderSchemaSection(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  schema: SectionSchema,
  options: RenderOptions,
): RenderedSection | null {
  let rendered: RenderedValue;
  if (schema.render === "table" && schema.columns) {
    rendered = renderTable(before, after, schema.paths, schema.columns, options);
  } else if (schema.render === "grouped-table" && schema.innerArray && schema.innerColumns) {
    rendered = renderGroupedTable(before, after, schema, options);
  } else {
    const sectionBefore = pickSectionObject(before, schema.paths);
    const sectionAfter = pickSectionObject(after, schema.paths);
    rendered = renderValue(sectionBefore, sectionAfter, {
      ...options,
      label: schema.name,
      pathKey: schema.paths[0] || schema.name,
      depth: 0,
    });
  }

  if (!rendered.html) return null;
  return { name: schema.name, html: rendered.html, count: rendered.count };
}

function renderValue(
  before: unknown,
  after: unknown,
  ctx: RenderOptions & { label: string; pathKey: string; depth: number },
): RenderedValue {
  const changed = hasChange(before, after, ctx.pathKey);
  if (!ctx.showUnchanged && !changed) return { html: "", changed: false, count: 0 };

  const scalar = scalarPair(before, after);
  if (scalar) {
    return {
      html: renderLine(ctx.label, scalar.before, scalar.after, statusOf(before, after), ctx.nodeStatus),
      changed,
      count: changed ? 1 : 0,
    };
  }

  if (isCollection(before, after, ctx.pathKey)) {
    const rendered = renderArray(before, after, ctx);
    return { html: rendered.html, changed, count: rendered.count || (changed ? 1 : 0) };
  }

  const rendered = renderObject(before, after, ctx);
  return { html: rendered.html, changed, count: rendered.count || (changed ? 1 : 0) };
}

function renderObject(
  before: unknown,
  after: unknown,
  ctx: RenderOptions & { label: string; pathKey: string; depth: number },
): RenderedValue {
  const beforeObj = isObj(before) ? before as Record<string, unknown> : {};
  const afterObj = isObj(after) ? after as Record<string, unknown> : {};
  const keys = unionKeys(beforeObj, afterObj);
  const scalarRows: string[] = [];
  const nested: string[] = [];
  let count = 0;

  for (const key of keys) {
    const childBefore = getField(beforeObj, key);
    const childAfter = getField(afterObj, key);
    const childChanged = hasChange(childBefore, childAfter, key);
    const scalar = scalarPair(childBefore, childAfter);
    if (scalar) {
      if (ctx.showUnchanged || childChanged || ctx.depth > 0) {
        scalarRows.push(scalarRow(key, scalar.before, scalar.after, statusOf(childBefore, childAfter), ctx.nodeStatus));
      }
      if (childChanged) count += 1;
      continue;
    }

    const rendered = renderValue(childBefore, childAfter, {
      ...ctx,
      label: humanizePath(key),
      pathKey: key,
      depth: ctx.depth + 1,
    });
    if (rendered.html) {
      nested.push("<div class='snapshot-nested'><div class='snapshot-nested-title'>" + escapeHtml(humanizePath(key)) + "</div>"
        + rendered.html + "</div>");
      count += rendered.count;
    }
  }

  const table = scalarRows.length
    ? "<table class='snapshot-kv'><tbody>" + scalarRows.join("") + "</tbody></table>"
    : "";
  return { html: table + nested.join(""), changed: count > 0, count };
}

function renderArray(
  before: unknown,
  after: unknown,
  ctx: RenderOptions & { label: string; pathKey: string; depth: number },
): RenderedValue {
  const beforeItems = arr(before);
  const afterItems = arr(after);
  if (looksLikeNameValueArray(beforeItems, afterItems)) {
    return renderTableFromItems(before, after, [""], [
      { path: "name", label: "Name" },
      { path: "value", label: "Value" },
    ], ctx);
  }

  const max = Math.max(beforeItems.length, afterItems.length);
  const cards: string[] = [];
  let count = 0;
  for (let i = 0; i < max; i += 1) {
    const childBefore = beforeItems[i];
    const childAfter = afterItems[i];
    const childChanged = hasChange(childBefore, childAfter, "");
    if (!ctx.showUnchanged && !childChanged) continue;
    const title = itemTitle(childBefore, childAfter, i);
    const rendered = renderValue(childBefore, childAfter, {
      ...ctx,
      label: title,
      pathKey: "",
      depth: ctx.depth + 1,
    });
    if (!rendered.html) continue;
    count += rendered.count || (childChanged ? 1 : 0);
    cards.push("<div class='snapshot-card " + statusOf(childBefore, childAfter) + "'><div class='snapshot-card-title'>"
      + escapeHtml(title) + "</div>" + rendered.html + "</div>");
  }

  return { html: cards.join(""), changed: count > 0, count };
}

function renderTable(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  paths: string[],
  columns: Array<{ path: string; label: string }>,
  options: RenderOptions,
): RenderedValue {
  return renderTableFromItems(before, after, paths, columns, { ...options, label: "", pathKey: paths[0] || "", depth: 0 });
}

function renderTableFromItems(
  before: unknown,
  after: unknown,
  paths: string[],
  columns: Array<{ path: string; label: string }>,
  options: RenderOptions & { label: string; pathKey: string; depth: number },
): RenderedValue {
  const rows: TableRow[] = [];
  for (const path of paths) {
    const beforeItems = arr(resolvePath(before, path));
    const afterItems = arr(resolvePath(after, path));
    const max = Math.max(beforeItems.length, afterItems.length);
    // Array alignment intentionally mirrors deepDiff: ordered collections compare
    // by index, so mid-array inserts can appear as a run of modified rows.
    for (let i = 0; i < max; i += 1) {
      const itemBefore = beforeItems[i];
      const itemAfter = afterItems[i];
      if (!options.showUnchanged && !hasChange(itemBefore, itemAfter, path)) continue;
      const cells: Record<string, RowCell> = {};
      for (const col of columns) {
        const cellBefore = resolvePath(itemBefore, col.path);
        const cellAfter = resolvePath(itemAfter, col.path);
        cells[col.path] = {
          before: unwrapValue(cellBefore),
          after: unwrapValue(cellAfter),
          changed: hasChange(cellBefore, cellAfter, col.path),
        };
      }
      rows.push({ idx: i, kind: statusOf(itemBefore, itemAfter), cells });
    }
  }
  if (!rows.length) return { html: "", changed: false, count: 0 };

  const showChange = options.nodeStatus === "modified" && !options.suppressChangeColumn;
  const head = "<tr><th class='row-idx'>#</th>" + columns.map((col) => "<th>" + escapeHtml(col.label) + "</th>").join("")
    + (showChange ? "<th>Change</th>" : "") + "</tr>";
  const body = rows.map((row) => renderRow(row, columns, showChange, options.nodeStatus)).join("");
  return {
    html: "<table class='change-table'><thead>" + head + "</thead><tbody>" + body + "</tbody></table>",
    changed: rows.some((row) => row.kind !== "unchanged" || Object.values(row.cells).some((cell) => cell.changed)),
    count: rows.filter((row) => row.kind !== "unchanged" || Object.values(row.cells).some((cell) => cell.changed)).length,
  };
}

function renderRow(
  row: TableRow,
  columns: Array<{ path: string; label: string }>,
  showChange: boolean,
  nodeStatus: SnapshotPanelNode["status"],
): string {
  const cells = columns.map((col) => {
    const cell = row.cells[col.path];
    return "<td>" + renderValueCell(cell.before, cell.after, cell.changed ? row.kind : "unchanged", nodeStatus) + "</td>";
  }).join("");
  const badge = showChange ? "<td><span class='change-kind " + row.kind + "'>" + capitalize(row.kind) + "</span></td>" : "";
  return "<tr class='row-" + row.kind + "'><td class='row-idx'>" + (row.idx + 1) + "</td>" + cells + badge + "</tr>";
}

function renderGroupedTable(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  schema: SectionSchema,
  options: RenderOptions,
): RenderedValue {
  const groups: string[] = [];
  let count = 0;
  for (const path of schema.paths) {
    const beforeGroups = arr(resolvePath(before, path));
    const afterGroups = arr(resolvePath(after, path));
    const max = Math.max(beforeGroups.length, afterGroups.length);
    for (let i = 0; i < max; i += 1) {
      const groupBefore = beforeGroups[i];
      const groupAfter = afterGroups[i];
      if (!options.showUnchanged && !hasChange(groupBefore, groupAfter, path)) continue;
      const kind = statusOf(groupBefore, groupAfter);
      const present = (groupAfter !== undefined ? groupAfter : groupBefore) as Record<string, unknown> | undefined;
      const labelValue = schema.groupLabelPath && present ? resolvePath(present, schema.groupLabelPath) : undefined;
      const label = labelValue != null ? stripHtml(String(labelValue)) : "Outcome " + (i + 1);
      const scalarRows = renderGroupScalars(groupBefore, groupAfter, schema, options);
      const inner = renderTableFromItems(groupBefore, groupAfter, [schema.innerArray || ""], schema.innerColumns || [], {
        ...options,
        suppressChangeColumn: kind !== "modified",
        label,
        pathKey: schema.innerArray || "",
        depth: 1,
      }).html;
      const head = "<div class='group-head'><span class='change-kind " + kind + "'>" + capitalize(kind) + "</span>"
        + "<span class='group-label'>" + escapeHtml(label) + "</span></div>";
      groups.push("<div class='outcome-group'>" + head + scalarRows + inner + "</div>");
      count += 1;
    }
  }
  return { html: groups.join(""), changed: count > 0, count };
}

function renderGroupScalars(
  before: unknown,
  after: unknown,
  schema: SectionSchema,
  options: RenderOptions,
): string {
  const beforeObj = isObj(before) ? before as Record<string, unknown> : {};
  const afterObj = isObj(after) ? after as Record<string, unknown> : {};
  const skip = new Set([schema.innerArray, schema.groupLabelPath].filter(Boolean) as string[]);
  const rows = unionKeys(beforeObj, afterObj).filter((key) => !skip.has(key)).map((key) => {
    const cellBefore = getField(beforeObj, key);
    const cellAfter = getField(afterObj, key);
    const scalar = scalarPair(cellBefore, cellAfter);
    if (!scalar) return "";
    if (!options.showUnchanged && !hasChange(cellBefore, cellAfter, key)) return "";
    return scalarRow(key, scalar.before, scalar.after, statusOf(cellBefore, cellAfter), options.nodeStatus);
  }).filter(Boolean).join("");
  return rows ? "<table class='snapshot-kv'><tbody>" + rows + "</tbody></table>" : "";
}

function scalarRow(
  key: string,
  before: unknown,
  after: unknown,
  kind: "added" | "removed" | "modified" | "unchanged",
  nodeStatus: SnapshotPanelNode["status"],
): string {
  return "<tr><th>" + escapeHtml(humanizePath(key)) + "</th><td>"
    + renderValueCell(before, after, kind, nodeStatus)
    + "</td></tr>";
}

function renderLine(
  label: string,
  before: unknown,
  after: unknown,
  kind: "added" | "removed" | "modified" | "unchanged",
  nodeStatus: SnapshotPanelNode["status"],
): string {
  const badge = nodeStatus === "modified" ? "<span class='change-kind " + kind + "'>" + capitalize(kind) + "</span>" : "";
  return "<ul class='changes'><li><div class='change-line-head'>" + badge
    + "<span class='change-line-label'>" + escapeHtml(label) + "</span></div>"
    + "<div class='change-line-value'>" + renderValueCell(before, after, kind, nodeStatus) + "</div></li></ul>";
}

function renderValueCell(
  before: unknown,
  after: unknown,
  kind: "added" | "removed" | "modified" | "unchanged",
  nodeStatus: SnapshotPanelNode["status"],
): string {
  if (nodeStatus === "added" || nodeStatus === "present") return oneSidedVal(after !== undefined ? after : before);
  if (nodeStatus === "deleted") return oneSidedVal(before !== undefined ? before : after);
  if (kind === "added") return insVal(after !== undefined ? after : before);
  if (kind === "removed") return delVal(before !== undefined ? before : after);
  if (kind === "modified") return diffValue(before, after);
  return faintVal(after !== undefined ? after : before);
}

function statusOf(before: unknown, after: unknown): "added" | "removed" | "modified" | "unchanged" {
  if (before === undefined) return "added";
  if (after === undefined) return "removed";
  return valuesEqual(before, after) ? "unchanged" : "modified";
}

function hasChange(before: unknown, after: unknown, pathKey = ""): boolean {
  if (before === undefined || after === undefined) return before !== after;
  const scalar = scalarPair(before, after);
  if (scalar) return !valuesEqual(scalar.before, scalar.after);
  if (isCollection(before, after, pathKey)) {
    const beforeItems = arr(before);
    const afterItems = arr(after);
    const max = Math.max(beforeItems.length, afterItems.length);
    for (let i = 0; i < max; i += 1) {
      if (hasChange(beforeItems[i], afterItems[i], "")) return true;
    }
    return false;
  }
  const beforeObj = isObj(before) ? before as Record<string, unknown> : {};
  const afterObj = isObj(after) ? after as Record<string, unknown> : {};
  for (const key of unionKeys(beforeObj, afterObj)) {
    if (hasChange(beforeObj[key], afterObj[key], key)) return true;
  }
  return false;
}

function scalarPair(before: unknown, after: unknown): { before: unknown; after: unknown } | null {
  const beforeUnwrapped = unwrapValue(before);
  const afterUnwrapped = unwrapValue(after);
  const beforeScalar = beforeUnwrapped == null || typeof beforeUnwrapped !== "object";
  const afterScalar = afterUnwrapped == null || typeof afterUnwrapped !== "object";
  return beforeScalar && afterScalar ? { before: beforeUnwrapped, after: afterUnwrapped } : null;
}

function arr(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function isObj(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isCollection(before: unknown, after: unknown, pathKey: string): boolean {
  return Array.isArray(before) || Array.isArray(after) || isCollectionKey(pathKey);
}

function isCollectionKey(key: string): boolean {
  return COLLECTION_KEYS.has(key);
}

function unionKeys(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): string[] {
  return [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
}

function ownsAny(paths: Set<string>, key: string): boolean {
  for (const path of paths) {
    if (key === path || key.startsWith(path + ".") || key.startsWith(path + "[")) return true;
  }
  return false;
}

function pickSectionObject(obj: Record<string, unknown> | undefined, paths: string[]): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const path of paths) {
    const value = resolvePath(obj, path);
    if (value !== undefined) out[path] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function getField(obj: Record<string, unknown> | undefined, key: string): unknown {
  return obj ? obj[key] : undefined;
}

function resolvePath(obj: unknown, path: string): unknown {
  if (obj == null || !path) return obj;
  let cur: unknown = obj;
  const tokens = path.match(/[^.[\]]+|\[\d+\]/g) || [];
  for (const token of tokens) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = token[0] === "[" ? (cur as unknown[])[Number(token.slice(1, -1))] : (cur as Record<string, unknown>)[token];
  }
  return cur;
}

function looksLikeNameValueArray(beforeItems: unknown[], afterItems: unknown[]): boolean {
  const items = [...beforeItems, ...afterItems].filter(isObj) as Array<Record<string, unknown>>;
  return items.length > 0 && items.every((item) => "name" in item && "value" in item);
}

function itemTitle(before: unknown, after: unknown, index: number): string {
  const item = (isObj(after) ? after : before) as Record<string, unknown> | undefined;
  if (item) {
    for (const key of ["fieldText", "label", "name", "fieldType", "field"]) {
      const value = unwrapValue(item[key]);
      if (value !== undefined && value !== null && typeof value !== "object") {
        return stripHtml(String(value));
      }
    }
  }
  return "Item " + (index + 1);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function humanizePath(path: string): string {
  const names: Record<string, string> = {
    assignmentItems: "Assignment item",
    choiceReferences: "Choice reference",
    choices: "Choice",
    conditions: "Condition",
    customErrorMessages: "Custom error message",
    dataTypeMappings: "Data type mapping",
    fields: "Field",
    filters: "Filter",
    inputAssignments: "Input assignment",
    inputParameters: "Input parameter",
    outputParameters: "Output parameter",
    processMetadataValues: "Process metadata value",
    rules: "Rule",
    scheduledPaths: "Scheduled path",
    storeOutputParameters: "Store output parameter",
    transformValues: "Transform value",
    valueMappings: "Value mapping",
    waitEvents: "Wait event",
  };
  return path.split(".").map((segment) => {
    const match = segment.match(/^([^[]+)(?:\[(\d+)\])?$/);
    if (!match) return segment;
    const name = names[match[1]] || match[1].replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase());
    return match[2] === undefined ? name : name + " " + (Number(match[2]) + 1);
  }).join(" > ");
}

function unwrapValue(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) return value;
  if ("elementReference" in value) return "{!" + (value as Record<string, unknown>).elementReference + "}";
  const keys = Object.keys(value);
  if (keys.length === 1) {
    const key = keys[0];
    const obj = value as Record<string, unknown>;
    if (key === "stringValue" || key === "numberValue" || key === "dateValue" || key === "dateTimeValue") return obj[key];
    if (key === "booleanValue") return String(obj[key]) === "true" ? "true" : "false";
  }
  return value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a && b && typeof a === "object" && typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

function renderScalar(value: unknown): string {
  if (value === undefined) return "<em>-</em>";
  if (value === null) return "<em>empty</em>";
  if (typeof value === "object") return "<pre>" + escapeHtml(JSON.stringify(value, null, 2)) + "</pre>";
  const text = String(value);
  if (text.length > LONG_TEXT_THRESHOLD || text.includes("\n")) {
    return "<pre>" + escapeHtml(text) + "</pre>";
  }
  return escapeHtml(text);
}

function insVal(value: unknown): string {
  return "<span class='val ins'>" + renderScalar(value) + "</span>";
}

function delVal(value: unknown): string {
  return "<span class='val del'>" + renderScalar(value) + "</span>";
}

function faintVal(value: unknown): string {
  return "<span class='val faint'>" + renderScalar(value) + "</span>";
}

function oneSidedVal(value: unknown): string {
  return "<span class='val one-sided'>" + renderScalar(value) + "</span>";
}

function diffValue(before: unknown, after: unknown): string {
  before = unwrapValue(before);
  after = unwrapValue(after);
  if (before === undefined) return insVal(after);
  if (after === undefined) return delVal(before);
  return delVal(before) + " <span class='arrow'>-></span> " + insVal(after);
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
