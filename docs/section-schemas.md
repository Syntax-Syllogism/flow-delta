# Section Schema Authoring Guide

The semantic property panel in the interactive diff organizes property changes into sections. This guide explains how to define, customize, and extend section schemas for new or modified node types.

## Overview

Section schemas live in `src/render/section-schemas.ts` and declare how each node type's properties should be grouped and rendered in the UI. They separate domain-specific structures (decision outcomes, field mappings, filters) from generic property changes, making diffs readable.

## When to add or modify a schema

**Add a schema when:**
- A new Salesforce node type ships with a specific domain concept (e.g., "Filters" for lookups, "Outcomes" for decisions)
- An existing node type's properties should be reorganized (e.g., grouping related fields)
- A collection should render as a table instead of scalar lines

**Modify a schema when:**
- The render mode is wrong (table should be grouped-table, etc.)
- Column labels need clarification
- New property paths are added to the node type in Salesforce

## Schema structure

A section schema declares how to render a group of properties:

```typescript
interface SectionSchema {
  name: string;           // Section header (e.g., "Outcomes", "Field Mappings")
  paths: string[];        // Top-level property keys this section owns
  render: RenderMode;     // How to display: "lines" | "table" | "grouped-table"
  columns?: ColumnSchema[];  // (table/grouped-table only) Column definitions
}

type RenderMode = "lines" | "table" | "grouped-table";

interface ColumnSchema {
  key: string;           // Property name to extract
  label: string;         // Column header
  unwrap?: boolean;      // Strip type wrappers like { stringValue: "x" } → "x"
  highlight?: boolean;   // Highlight in green/red for changed cells
}
```

## Render modes

### `"lines"` (default fallback)

Renders each property change as a labeled scalar comparison. Used for unstructured configuration.

**Example:**

```
Before:  condition = x
After:   condition = y
```

**When to use:**
- Scalar properties with no internal structure
- Configuration that doesn't fit a table
- Final fallback for properties not matched by any schema

### `"table"`

Renders an array of objects as a table. Each array item becomes a row; `columns` define which properties extract as columns.

**Example:**

```
inputAssignments (table):
  Field     | Value
  Phone     | "+1-555-1234"
  Email     | "new@example.com"
```

**When to use:**
- Flat arrays of similar objects (field mappings, filters, conditions)
- Collections with 2–4 repeating properties per item
- Record create/update input assignments

**Limitations:**
- Does not handle nested arrays within rows
- For nested structures, use `"grouped-table"` instead

### `"grouped-table"`

Renders a hierarchical structure: groups (labeled, like outcomes) each containing an inner table.

**Example:**

```
rules (grouped-table):
  Outcome: MyOutcome
    Field    | Operator | Value
    Status   | Equals   | "Active"
    Priority | GreaterThan | 5

  Outcome: DefaultOutcome
    Field    | Operator | Value
    Type     | Equals   | "Case"
```

**When to use:**
- Collections with headers + nested table (decisions with outcomes and conditions)
- Multi-level structures where grouping adds clarity
- Arrays containing arrays or complex sub-objects

## Built-in schemas (examples)

### Decision node

```typescript
{
  name: "Outcomes",
  paths: ["rules"],
  render: "grouped-table",
  columns: [
    { key: "leftValueReference", label: "Resource", unwrap: true },
    { key: "operator", label: "Operator" },
    { key: "rightValue", label: "Value", unwrap: true }
  ]
}
```

Renders each `rules[]` entry as a group (labeled by rule name), with its `conditions[]` as a table.

### Record Create/Update

```typescript
{
  name: "Field Mappings",
  paths: ["inputAssignments"],
  render: "table",
  columns: [
    { key: "field", label: "Field" },
    { key: "value", label: "Value", unwrap: true }
  ]
}
```

### Record Lookup/Delete

```typescript
{
  name: "Filters",
  paths: ["filters"],
  render: "table",
  columns: [
    { key: "field", label: "Field" },
    { key: "operator", label: "Operator" },
    { key: "value", label: "Value", unwrap: true }
  ]
}
```

## Adding a schema for a new node type

**Scenario:** Salesforce adds a new node type `"myCustomNode"` with properties `triggers`, `handlers`, and `config`.

1. **Determine the structure:**
   - Inspect the parsed XML or a fixture's `diff.json` to see the property shape
   - Identify which properties group semantically (e.g., handlers + config might be separate sections)

2. **Define the schema:**

   ```typescript
   const myCustomNodeSchemas: SectionSchema[] = [
     {
       name: "Triggers",
       paths: ["triggers"],
       render: "table",
       columns: [
         { key: "name", label: "Trigger" },
         { key: "event", label: "Event" }
       ]
     },
     {
       name: "Handlers",
       paths: ["handlers"],
       render: "grouped-table",
       columns: [
         { key: "type", label: "Type" },
         { key: "action", label: "Action" }
       ]
     }
   ];
   ```

3. **Register in `getNodeTypeSchemas()`:**

   ```typescript
   function getNodeTypeSchemas(nodeType: NodeType): SectionSchema[] {
     switch (nodeType) {
       case "myCustomNode":
         return myCustomNodeSchemas;
       // ... other cases
     }
   }
   ```

4. **Test with a fixture:**
   - Create or find a fixture with a `myCustomNode` before/after
   - Add a test row in `test/semantic-diff.test.ts` with expected changes
   - Run `npm test` and render with `npm run render:fixtures`
   - Verify the properties appear in the correct sections in the HTML

## Column schema properties

### `key: string` (required)

The property path to extract from each row. For flat properties, use the property name directly:

```typescript
{ key: "field", label: "Field" }  // From each object's .field
```

For nested properties, use dot notation:

```typescript
{ key: "value.stringValue", label: "Value" }
```

### `label: string` (required)

The column header displayed in the table. Keep it short (1–3 words).

### `unwrap?: boolean`

When `true`, strips type-wrapper objects. Converts:

```typescript
{ stringValue: "hello" } → "hello"
{ booleanValue: "true" } → "true"
{ numberValue: 42 } → 42
```

Use this for Salesforce typed values to show the scalar value cleanly.

```typescript
{ key: "value", label: "Value", unwrap: true }  // Shows the value, not the wrapper
```

### `highlight?: boolean`

(Not currently used in the renderer; reserved for future enhancement. Ignore for now.)

## Rendering behavior

### Modified rows in tables

When a row's property changes:

- The changed cell is highlighted (green + for additions, red − for deletions)
- Unchanged sibling columns are shown **faint** (gray) as context
- Both before and after are shown side-by-side

Example:

```
Field Mappings (modified):
  Before:    After:
  Phone | "+1-555-0000"   →   Phone | "+1-555-1234"  (highlighted)
  Email | "old@ex.com"   →   Email | "old@ex.com"  (faint, unchanged)
```

### Added/deleted rows

- Added rows show the new content with green highlighting
- Deleted rows show the old content with red strikethrough

### Added/deleted nodes

- No section schemas are used
- The panel shows an empty-state message: *"This node was added in the new version."*

## Fallback grouping

Properties that don't match any schema path are grouped by:

1. **Array name** (if the change is array-indexed)
   - Changes to `myItems[0].field` group under "myItems"
2. **Generic "Configuration" section** (for unstructured scalars)

This ensures no property changes are ever left unrendered.

## Common patterns

### Sorted arrays (unordered)

If an array is in `UNORDERED_ARRAY_KEYS` (see [architecture.md](architecture.md)), it's sorted during canonicalization. Changes to item order **will not** produce diffs because the sort is stable.

```typescript
// If "inputParameters" is unordered:
before:  [{ name: "a" }, { name: "b" }]
after:   [{ name: "b" }, { name: "a" }]  // Still zero diff (re-sorted)
```

Add unordered arrays to `UNORDERED_ARRAY_KEYS` in `src/model/build-model.ts` if reordering shouldn't count as a change.

### Positional arrays (ordered)

Arrays NOT in `UNORDERED_ARRAY_KEYS` are kept positional. A change in position **will** produce a diff.

Example: decision `rules[]` is positional because outcome order matters.

```typescript
before:  rules[0].name = "Outcome1"
after:   rules[0].name = "Outcome2"  // Different outcome in position 0 = diff
```

## Debugging schema issues

If properties appear in the wrong section or don't render as expected:

1. **Check the `diff.json` output** — does the change path match a schema path?
   ```bash
   npx tsx src/cli.ts --old before.xml --new after.xml --json --out out/
   cat out/*.diff.json | jq '.nodes[] | select(.status == "modified") | .changes'
   ```

2. **Verify the schema is registered** — does `getNodeTypeSchemas()` include it?
3. **Test render mode** — try switching to a simpler mode (lines → table) to isolate the issue
4. **Check column keys** — use `rtk read src/model/build-model.ts` to see how properties are canonicalized
5. **Render fixtures** — `npm run render:fixtures` and inspect the HTML detail panel manually

## Testing new schemas

Add a test case in `test/semantic-diff.test.ts`:

```typescript
{
  name: "my_custom_node_change",
  expectedSummary: { addedNodes: 0, removedNodes: 0, modifiedNodes: 1, unchangedNodes: 2, addedEdges: 0, removedEdges: 0 },
  assertion: (diff) => {
    const modified = diff.nodes.find(n => n.status === "modified");
    assert.equal(modified?.changes?.[0].path, "myProperty");
  }
}
```

Run:
```bash
npm test
npm run render:fixtures
```

Then visually verify the section organization in the HTML.
