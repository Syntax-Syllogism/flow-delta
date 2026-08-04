import type { PropertyChange } from "../diff/deep-diff.ts";
import { humanizePath } from "../render/snapshot-panel.ts";

export interface ComponentSchemaGroup {
  name: string;
  /** Top-level component properties owned by this group. */
  paths: string[];
  /** Optional labels for a property root or an exact changed path. */
  labels?: Record<string, string>;
}

export interface ComponentSchema {
  label: string;
  groups: ComponentSchemaGroup[];
}

export interface LabeledPropertyChange extends PropertyChange {
  label: string;
}

export interface ResolvedComponentSection {
  name: string;
  changes: LabeledPropertyChange[];
}

export interface ResolvedComponentChanges {
  componentLabel: string;
  sections: ResolvedComponentSection[];
}

export const COMPONENT_SCHEMAS: Readonly<Record<string, ComponentSchema>> = {
  "flowruntime:interview": {
    label: "Flow Interview",
    groups: [
      { name: "Flow", paths: ["flowName"], labels: { flowName: "Flow" } },
      { name: "Input Variables", paths: ["flowArguments"], labels: { flowArguments: "Input Variables" } },
    ],
  },
  "force:relatedListSingleContainer": {
    label: "Related List",
    groups: relatedListGroups(),
  },
  "force:relatedListContainer": {
    label: "Related Lists",
    groups: relatedListGroups(),
  },
  "force:highlightsPanel": {
    label: "Highlights Panel",
    groups: [
      {
        name: "Display",
        paths: ["numVisibleActions", "showHighlightsPanel", "hideButtons", "variant", "displayDensity"],
        labels: {
          numVisibleActions: "Visible Actions",
          showHighlightsPanel: "Show Highlights Panel",
          hideButtons: "Hide Buttons",
          variant: "Variant",
          displayDensity: "Display Density",
        },
      },
    ],
  },
  "flexipage:tab": {
    label: "Tab",
    groups: [
      {
        name: "Tab",
        paths: ["title", "label", "body", "active"],
        labels: { title: "Title", label: "Label", body: "Content", active: "Active" },
      },
    ],
  },
  "flexipage:tabset": {
    label: "Tabset",
    groups: [
      {
        name: "Tabs",
        paths: ["label", "tabs", "activeTab"],
        labels: { label: "Label", tabs: "Tabs", activeTab: "Active Tab" },
      },
    ],
  },
};

function relatedListGroups(): ComponentSchemaGroup[] {
  return [
    {
      name: "Related List",
      paths: ["relatedListName", "relatedListLabel", "relatedListTitle"],
      labels: {
        relatedListName: "Related List",
        relatedListLabel: "Label",
        relatedListTitle: "Title",
      },
    },
    {
      name: "Display",
      paths: ["rowsToDisplay", "numVisibleActions", "showSearchBar", "enableListView", "enableEnhancedList", "showActionBar", "hideSearchBar", "hideUpdateButton", "enableFieldSetLabels"],
      labels: {
        rowsToDisplay: "Rows to Display",
        numVisibleActions: "Visible Actions",
        showSearchBar: "Show Search Bar",
        enableListView: "Enable List View",
        enableEnhancedList: "Enable Enhanced List",
        showActionBar: "Show Action Bar",
        hideSearchBar: "Hide Search Bar",
        hideUpdateButton: "Hide Update Button",
        enableFieldSetLabels: "Enable Field Set Labels",
      },
    },
    {
      name: "Sorting",
      paths: ["sortBy", "sortField", "sortOrder"],
      labels: { sortBy: "Sort By", sortField: "Sort Field", sortOrder: "Sort Order" },
    },
    { name: "Columns", paths: ["fields"], labels: { fields: "Fields" } },
  ];
}

export function getComponentSchema(componentName: string): ComponentSchema | undefined {
  return Object.prototype.hasOwnProperty.call(COMPONENT_SCHEMAS, componentName)
    ? COMPONENT_SCHEMAS[componentName]
    : undefined;
}

/**
 * Resolve changed component properties into ordered, labeled groups. A known
 * component's uncovered properties are retained in an explicit Other group.
 */
export function resolveComponentChanges(
  componentName: string,
  changes: PropertyChange[],
): ResolvedComponentChanges | undefined {
  const schema = getComponentSchema(componentName);
  if (!schema) return undefined;

  const grouped = schema.groups.map((group) => ({ name: group.name, changes: [] as LabeledPropertyChange[] }));
  const other: LabeledPropertyChange[] = [];

  for (const change of changes) {
    const groupIndex = schema.groups.findIndex((group) => group.paths.some((path) => matchesPath(change.path, path)));
    const group = groupIndex >= 0 ? schema.groups[groupIndex] : undefined;
    const labels = group?.labels ?? {};
    const root = rootPath(change.path);
    const label = labels[change.path] ?? labels[root] ?? humanizePath(change.path);
    const labeled = { ...change, label };
    if (groupIndex >= 0) grouped[groupIndex].changes.push(labeled);
    else other.push(labeled);
  }

  const sections = grouped.filter((group) => group.changes.length);
  if (other.length) sections.push({ name: "Other", changes: other });
  return { componentLabel: schema.label, sections };
}

function rootPath(path: string): string {
  return path.split(/[.[\]]/, 1)[0] || path;
}

function matchesPath(path: string, schemaPath: string): boolean {
  return path === schemaPath || path.startsWith(`${schemaPath}.`) || path.startsWith(`${schemaPath}[`);
}
