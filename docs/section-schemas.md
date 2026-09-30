---
title: Section Schema Authoring Guide
description: Define semantic property groups for Flow element diffs.
---

# Section Schema Authoring Guide

The property panel in the interactive diff groups property changes into sections. This guide shows how to define and change section schemas for new or existing node types.

## Overview

Section schemas live in `src/render/section-schemas.ts`. Each one says how a node type's properties are grouped and rendered. Schemas keep domain structures (decision outcomes, field mappings, filters) apart from generic property changes, which makes diffs easier to read.

## When to add or change a schema

**Add a schema when:**

- A new Salesforce node type ships with its own domain concept (for example "Filters" for lookups, "Outcomes" for decisions).
- An existing node type's properties should be regrouped.
- A collection should render as a table instead of scalar lines.

**Change a schema when:**

- The render mode is wrong (for example a table should be a grouped-table).
- Column labels are unclear.
- Salesforce adds new property paths to the node type.

## Schema structure

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

Shows each property change as a labeled scalar comparison. Use it for unstructured configuration.

```
Before:  condition = x
After:   condition = y
```

**Use it for:**

- scalar properties with no internal structure;
- configuration that doesn't fit a table; and
- the final fallback, for properties no schema matches.

### `"table"`

Shows an array of objects as a table. Each item is a row, and `columns` choose which properties become columns.

```
inputAssignments (table):
  Field     | Value
  Phone     | "+1-555-1234"
  Email     | "new@example.com"
```

**Use it for:**

- flat arrays of similar objects (field mappings, filters, conditions);
- collections with 2–4 repeating properties per item; and
- Record Create/Update input assignments.

**Limits:** it can't handle nested arrays inside rows. For nested structures, use `"grouped-table"`.

### `"grouped-table"`

Shows a hierarchy. Each labeled group (an outcome, for example) holds an inner table.

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

**Use it for:**

- collections with a header and a nested table (decisions with outcomes and conditions);
- multi-level structures where grouping helps; and
- arrays that contain arrays or complex sub-objects.

## Built-in schemas

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

Each `rules[]` entry becomes a group, labeled by rule name. Its `conditions[]` become the table.

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

**Scenario:** Salesforce adds a node type `"myCustomNode"` with properties `triggers`, `handlers`, and `config`.

1. **Find the structure.** Look at the parsed XML, or a fixture's `diff.json`, to see the property shape. Decide which properties belong together (handlers and config might be separate sections).

2. **Define the schema.**

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

3. **Register it in `getNodeTypeSchemas()`.**

   ```typescript
   function getNodeTypeSchemas(nodeType: NodeType): SectionSchema[] {
     switch (nodeType) {
       case "myCustomNode":
         return myCustomNodeSchemas;
       // ... other cases
     }
   }
   ```

4. **Test it with a fixture.**
   - Create or find a fixture with a `myCustomNode` before/after.
   - Add a test row in `test/semantic-diff.test.ts` with the expected changes.
   - Run `npm test` and `npm run render:fixtures`.
   - Open the HTML and check the properties appear in the right sections.

## Column properties

### `key: string` (required)

The property path to read from each row. For a flat property, use its name:

```typescript
{ key: "field", label: "Field" }  // From each object's .field
```

For a nested property, use dot notation:

```typescript
{ key: "value.stringValue", label: "Value" }
```

### `label: string` (required)

The column header. Keep it to 1–3 words.

### `unwrap?: boolean`

When `true`, strips type-wrapper objects:

```typescript
{ stringValue: "hello" } → "hello"
{ booleanValue: "true" } → "true"
{ numberValue: 42 } → 42
```

Use it for Salesforce typed values, so the table shows the scalar and not the wrapper.

```typescript
{ key: "value", label: "Value", unwrap: true }  // Shows the value, not the wrapper
```

### `highlight?: boolean`

Not used by the renderer yet. Reserved for later. Ignore it.

## Rendering behavior

### Modified rows in tables

When a row's property changes:

- The changed cell is highlighted (green `+` for additions, red `−` for deletions).
- Unchanged sibling columns are shown **faint** (gray) as context.
- Before and after are shown side by side.

```
Field Mappings (modified):
  Before:    After:
  Phone | "+1-555-0000"   →   Phone | "+1-555-1234"  (highlighted)
  Email | "old@ex.com"   →   Email | "old@ex.com"  (faint, unchanged)
```

### Added and deleted rows

- Added rows show the new content, highlighted green.
- Deleted rows show the old content, struck through in red.

### Added and deleted nodes

Section schemas aren't used. The panel shows an empty-state message: *"This node was added in the new version."*

## Fallback grouping

Properties that match no schema path are grouped by:

1. **Array name**, if the change is array-indexed. Changes to `myItems[0].field` go under "myItems".
2. **A generic "Configuration" section**, for unstructured scalars.

So no property change is ever left unrendered.

## Array ordering

### Unordered arrays

An array in `UNORDERED_ARRAY_KEYS` (see [architecture.md](architecture.md)) is sorted during canonicalization. The sort is stable, so a change in item order **won't** produce a diff.

```typescript
// If "inputParameters" is unordered:
before:  [{ name: "a" }, { name: "b" }]
after:   [{ name: "b" }, { name: "a" }]  // Still zero diff (re-sorted)
```

Add an array to `UNORDERED_ARRAY_KEYS` in `src/model/build-model.ts` if reordering shouldn't count as a change.

### Positional arrays

Arrays **not** in `UNORDERED_ARRAY_KEYS` stay positional. A change in position **does** produce a diff. Decision `rules[]` is positional, because outcome order matters.

```typescript
before:  rules[0].name = "Outcome1"
after:   rules[0].name = "Outcome2"  // Different outcome in position 0 = diff
```

## Debugging schema issues

If properties land in the wrong section or don't render as expected:

1. **Check `diff.json`.** Does the change path match a schema path?

   ```bash
   npx tsx src/cli.ts --old before.xml --new after.xml --json --out out/
   cat out/*.diff.json | jq '.nodes[] | select(.status == "modified") | .changes'
   ```

2. **Check registration.** Does `getNodeTypeSchemas()` include the schema?
3. **Simplify the render mode.** Try a simpler mode (lines instead of table) to isolate the issue.
4. **Check column keys.** Read `src/model/build-model.ts` to see how properties are canonicalized.
5. **Render the fixtures.** Run `npm run render:fixtures` and inspect the HTML detail panel.

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

Then run:

```bash
npm test
npm run render:fixtures
```

Finally, open the HTML and check the section layout by eye.
