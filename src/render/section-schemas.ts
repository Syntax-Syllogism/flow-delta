import type { NodeType } from "../model/graph-model.ts";

export interface ColumnDef {
  /** Sub-field path within an item, e.g. "field" or "value" (typed wrappers are unwrapped). */
  path: string;
  /** Column header shown to the reviewer. */
  label: string;
}

export interface SectionSchema {
  name: string;
  /** Top-level metadata keys this section owns. */
  paths: string[];
  /**
   * - "lines": labeled before → after lines (default for scalars / fallback).
   * - "table": each array item under `paths` is one row, laid out by `columns`.
   * - "grouped-table": items grouped by the outer array; each group's `innerArray` is a table.
   */
  render: "lines" | "table" | "grouped-table";
  /** Columns for render: "table". */
  columns?: ColumnDef[];
  /** render: "grouped-table" — per-group header field, the inner array to tabulate, and its columns. */
  groupLabelPath?: string;
  innerArray?: string;
  innerColumns?: ColumnDef[];
}

const MAPPING_COLUMNS: ColumnDef[] = [
  { path: "field", label: "Field" },
  { path: "value", label: "Value" },
];

const FILTER_COLUMNS: ColumnDef[] = [
  { path: "field", label: "Field" },
  { path: "operator", label: "Operator" },
  { path: "value", label: "Value" },
];

const PARAM_COLUMNS: ColumnDef[] = [
  { path: "name", label: "Name" },
  { path: "value", label: "Value" },
  { path: "assignToReference", label: "Assign To" },
];

const SECTION_SCHEMAS: Partial<Record<NodeType, SectionSchema[]>> = {
  decision: [{
    name: "Outcomes",
    paths: ["rules"],
    render: "grouped-table",
    groupLabelPath: "label",
    innerArray: "conditions",
    innerColumns: [
      { path: "leftValueReference", label: "Resource" },
      { path: "operator", label: "Operator" },
      { path: "rightValue", label: "Value" },
    ],
  }],
  assignment: [{
    name: "Assignment Items",
    paths: ["assignmentItems"],
    render: "table",
    columns: [
      { path: "assignToReference", label: "Variable" },
      { path: "operator", label: "Operator" },
      { path: "value", label: "Value" },
    ],
  }],
  recordCreate: [{ name: "Field Mappings", paths: ["inputAssignments"], render: "table", columns: MAPPING_COLUMNS }],
  recordUpdate: [{ name: "Field Mappings", paths: ["inputAssignments"], render: "table", columns: MAPPING_COLUMNS }],
  recordLookup: [{ name: "Filters", paths: ["filters"], render: "table", columns: FILTER_COLUMNS }],
  recordDelete: [{ name: "Filters", paths: ["filters"], render: "table", columns: FILTER_COLUMNS }],
  actionCall: [{ name: "Parameters", paths: ["inputParameters", "outputParameters"], render: "table", columns: PARAM_COLUMNS }],
  apexPluginCall: [{ name: "Parameters", paths: ["inputParameters", "outputParameters"], render: "table", columns: PARAM_COLUMNS }],
  wait: [{
    name: "Wait Events",
    paths: ["waitEvents"],
    render: "table",
    columns: [
      { path: "label", label: "Label" },
      { path: "offset", label: "Offset" },
      { path: "offsetUnit", label: "Unit" },
      { path: "resumeDateReference", label: "Resume Date" },
    ],
  }],
};

export function getSectionSchemas(type: NodeType): SectionSchema[] {
  return SECTION_SCHEMAS[type] ?? [];
}
