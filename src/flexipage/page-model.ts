export interface PageHeader {
  masterLabel?: string;
  type?: string;
  sobjectType?: string;
  template?: string;
  parentFlexiPage?: string;
  description?: string;
}

export interface ComponentItem {
  kind: "component";
  componentName: string;
  properties: Record<string, string>;
  facetRefs: string[];
}

export interface FieldItem {
  kind: "field";
  fieldItem: string;
  attributes: Record<string, string>;
}

export type Item = ComponentItem | FieldItem;

export interface Region {
  name: string;
  type: "Region" | "Facet";
  mode?: "Replace" | "Append" | "Prepend";
  items: Item[];
}

export interface PageModel {
  pageName: string;
  header: PageHeader;
  regions: Region[];
}
