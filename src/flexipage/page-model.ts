export interface PageHeader {
  masterLabel?: string;
  type?: string;
  sobjectType?: string;
  template?: string;
  parentFlexiPage?: string;
  description?: string;
}

export type PropertyValue = string | PropertyValue[] | { [key: string]: PropertyValue };

export interface ComponentItem {
  kind: "component";
  componentName: string;
  identifier?: string;
  properties: Record<string, PropertyValue>;
  facetRefs: string[];
}

export interface FieldItem {
  kind: "field";
  fieldItem: string;
  identifier?: string;
  attributes: Record<string, PropertyValue>;
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
