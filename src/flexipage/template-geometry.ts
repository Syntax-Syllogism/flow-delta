export interface SlotGeometry {
  slot: string;
  widthPercent?: number;
}

export interface StackGeometry {
  stack: Array<SlotGeometry | LayoutRow>;
  widthPercent: number;
}

export type LayoutCell = SlotGeometry | StackGeometry;
export type LayoutRow = LayoutCell[];

export interface TemplateGeometry {
  label: string;
  rows: LayoutRow[];
}

const headerAndMain: TemplateGeometry = {
  label: "Header and One Region",
  rows: [[{ slot: "header", widthPercent: 100 }], [{ slot: "main", widthPercent: 100 }]],
};

const singleRegion: TemplateGeometry = {
  label: "One Region",
  rows: [[{ slot: "main", widthPercent: 100 }]],
};

const headerThreeColumns: TemplateGeometry = {
  label: "Header and Three Regions",
  rows: [
    [{ slot: "header", widthPercent: 100 }],
    [{ slot: "leftsidebar", widthPercent: 33.34 }, { slot: "main", widthPercent: 33.33 }, { slot: "rightsidebar", widthPercent: 33.33 }],
  ],
};

const registry: Record<string, TemplateGeometry> = {
  recordHomeTemplateDesktop: { label: "Header and Right Sidebar", rows: [[{ slot: "header", widthPercent: 100 }], [{ slot: "main", widthPercent: 67 }, { slot: "sidebar", widthPercent: 33 }]] },
  recordHomeLeftSidebarTemplateDesktop: { label: "Header and Left Sidebar", rows: [[{ slot: "header", widthPercent: 100 }], [{ slot: "sidebar", widthPercent: 33 }, { slot: "main", widthPercent: 67 }]] },
  recordHomeTwoColEqualHeaderTemplateDesktop: { label: "Header and Two Equal Regions", rows: [[{ slot: "header", widthPercent: 100 }], [{ slot: "leftcol", widthPercent: 50 }, { slot: "rightcol", widthPercent: 50 }]] },
  recordHomeThreeColHeaderTemplateDesktop: headerThreeColumns,
  recordHomeSingleColTemplateDesktop: headerAndMain,
  recordHomeSimpleViewTemplate: headerAndMain,
  recordHomeWithSubheaderTemplateDesktop: { label: "Header, Subheader, Right Sidebar", rows: [[{ slot: "header", widthPercent: 100 }], [{ slot: "subheader", widthPercent: 100 }], [{ slot: "main", widthPercent: 67 }, { slot: "sidebar", widthPercent: 33 }]] },
  recordHomeWithSubheaderLeftSidebarTemplateDesktop: { label: "Header, Subheader, Left Sidebar", rows: [[{ slot: "header", widthPercent: 100 }], [{ slot: "subheader", widthPercent: 100 }], [{ slot: "sidebar", widthPercent: 33 }, { slot: "main", widthPercent: 67 }]] },
  recordHomePinnedHeaderTemplateDesktop: headerThreeColumns,
  recordPrintableViewTemplate: { label: "Printable View", rows: [[{ slot: "header", widthPercent: 100 }], [{ slot: "main", widthPercent: 100 }], [{ slot: "footer", widthPercent: 100 }]] },
  defaultAppHomeTemplate: singleRegion,
  appHomeTemplateTwoColumns: { label: "Two Regions", rows: [[{ slot: "column1", widthPercent: 50 }, { slot: "column2", widthPercent: 50 }]] },
  appHomeTemplateThreeColumns: { label: "Three Regions", rows: [[{ slot: "region1", widthPercent: 33.34 }, { slot: "region2", widthPercent: 33.33 }, { slot: "region3", widthPercent: 33.33 }]] },
  appHomeTemplateTwoColumnsStacked: { label: "Main Region and Right Sidebar", rows: [[{ slot: "region1", widthPercent: 67 }, { widthPercent: 33, stack: [{ slot: "region2" }, { slot: "region3" }] }]] },
  appHomeTemplateHeaderTwoColumns15LeftSidebar: { label: "Header and Left Sidebar with 15% width", rows: [[{ slot: "region1", widthPercent: 100 }], [{ slot: "region2", widthPercent: 15 }, { slot: "region3", widthPercent: 85 }]] },
  appHomeTemplateHeaderTwoColumns: { label: "Header and Two Regions", rows: [[{ slot: "region1", widthPercent: 100 }], [{ slot: "region2", widthPercent: 67 }, { slot: "region3", widthPercent: 33 }]] },
  appHomeTemplateHeaderTwoColumnsEqualWidth: { label: "Header and Two Equal Regions", rows: [[{ slot: "region1", widthPercent: 100 }], [{ slot: "region2", widthPercent: 50 }, { slot: "region3", widthPercent: 50 }]] },
  appHomeTemplateHeaderTwoColumnsLeftSidebar: { label: "Header and Left Sidebar", rows: [[{ slot: "region1", widthPercent: 100 }], [{ slot: "region2", widthPercent: 33 }, { slot: "region3", widthPercent: 67 }]] },
  "home:desktopTemplate": { label: "Standard Home Page", rows: [[{ widthPercent: 67, stack: [{ slot: "top" }, [{ slot: "bottomLeft", widthPercent: 50 }, { slot: "bottomRight", widthPercent: 50 }]] }, { slot: "sidebar", widthPercent: 33 }]] },
  "industries_common:homeTemplateOneRegion": singleRegion,
};

const baseRegistry = registry;
const canonicalRegistry: Record<string, TemplateGeometry> = {};
for (const [template, geometry] of Object.entries(baseRegistry)) {
  // Keys that already carry a namespace (home:, industries_common:) are canonical as-is;
  // the flexipage-owned ones are keyed namespaced, with the bare name kept as an alias.
  const canonical = template.includes(":") ? template : `flexipage:${template}`;
  canonicalRegistry[canonical] = geometry;
  if (canonical.startsWith("flexipage:")) canonicalRegistry[template] = geometry;
}

for (const [template, geometry] of Object.entries(canonicalRegistry)) validateTemplateGeometry(geometry, template);

export const TEMPLATE_GEOMETRY: Readonly<Record<string, TemplateGeometry>> = deepFreeze(canonicalRegistry);

export function getTemplateGeometry(template: string | undefined): TemplateGeometry | undefined {
  return template === undefined ? undefined : TEMPLATE_GEOMETRY[template];
}

export function validateTemplateGeometry(geometry: TemplateGeometry, template = "template"): void {
  if (geometry.rows.length === 0 || geometry.rows.some((row) => row.length === 0 || !validRow(row))) {
    throw new Error(`Invalid geometry for ${template}: each row must contain positive widths totaling 100%`);
  }
}

function validRow(row: LayoutRow): boolean {
  const total = row.reduce((sum, cell) => sum + cellWidth(cell), 0);
  return row.every((cell) => cellWidth(cell) > 0 && (isStack(cell) ? cell.stack.length > 0 && cell.stack.every((child) => Array.isArray(child) ? validRow(child) : true) : true)) && total > 99.9 && total < 100.1;
}

function cellWidth(cell: LayoutCell): number {
  return cell.widthPercent ?? 100;
}

function isStack(cell: LayoutCell): cell is StackGeometry {
  return "stack" in cell;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
