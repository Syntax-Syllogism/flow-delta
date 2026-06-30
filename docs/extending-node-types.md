# Extending FlowDelta for New Salesforce Node Types

When Salesforce ships a new Flow element type (or an existing type gains new properties), this guide explains how to extend FlowDelta to support it.

## Overview

Adding a new node type involves three steps:

1. **Declare the type** in `src/model/graph-model.ts` (if not already there)
2. **Verify parsing** — confirm the vendored parser handles it
3. **Add a section schema** (optional) for better rendering

## Step 1: Declare the NodeType

All supported element types are listed in `src/model/graph-model.ts`:

```typescript
export type NodeType =
  | "start"
  | "end"
  | "assignment"
  // ... existing types
  | "myNewType"  // Add here
  | "unknown";
```

**Rules:**

- Use lowercase, camelCase
- Use the exact name from the Salesforce XML (the element type)
- Don't forget to add a test fixture (see step 3 below)

## Step 2: Verify parser support

The parser is vendored from Google Flow Lens and lives in `src/parser/flow_types.ts` (read-only). Check if the new element type is already defined:

```bash
rtk grep "myNewType" src/parser/flow_types.ts
```

**If it's already there:**
- The parser understands the element and will parse it correctly
- Move to step 3

**If it's not there:**
- The parser may not recognize the new element
- You have two options:
  1. **Open an upstream issue** with Google Flow Lens — request they add the type
  2. **Add a fallback in `src/model/build-model.ts`** to catch unknown elements as `"unknown"` type

The parser already includes a fallback for unrecognized types, so parsing won't fail. Unknown elements will be parsed but classified as `type: "unknown"` in the `GraphModel`.

## Step 3: Add a section schema (optional)

If the new type has domain-specific properties that should render as semantic sections (e.g., "Filters", "Outcomes"), add a section schema in `src/render/section-schemas.ts`:

```typescript
const myNewTypeSchemas: SectionSchema[] = [
  {
    name: "Configuration",
    paths: ["myProperty", "anotherProperty"],
    render: "lines"  // or "table" / "grouped-table"
  }
];

function getNodeTypeSchemas(nodeType: NodeType): SectionSchema[] {
  switch (nodeType) {
    case "myNewType":
      return myNewTypeSchemas;
    // ... other cases
  }
}
```

See [docs/section-schemas.md](section-schemas.md) for detailed schema authoring.

**If you skip this step:**
- The diff still works; changed properties will appear in the generic `"Configuration"` fallback section
- The rendering is less polished, but still correct

## Step 4: Add test coverage

Create a fixture with the new element type in both before and after versions:

```bash
mkdir -p fixtures/diff/my_new_type/
# Add before.flow-meta.xml and after.flow-meta.xml with the new element
```

Add a test row in `test/semantic-diff.test.ts`:

```typescript
{
  name: "my_new_type",
  expectedSummary: {
    addedNodes: 0,
    removedNodes: 0,
    modifiedNodes: 1,  // The new element was modified
    unchangedNodes: 3,
    addedEdges: 0,
    removedEdges: 0
  },
  assertion: (diff) => {
    const modified = diff.nodes.find(n => n.type === "myNewType");
    assert(modified, "myNewType node should be modified");
  }
}
```

Run the tests:

```bash
npm test
npm run render:fixtures
```

Open `flow-delta-out/fixtures/my_new_type.html` in a browser and verify the rendering.

## Common scenarios

### Scenario 1: Salesforce adds a new node type with simple properties

Example: A new `"notification"` element that sends notifications.

**Steps:**

1. Add `"notification"` to `NodeType` in `graph-model.ts`
2. Check if the parser supports it (run the test suite)
3. Create a fixture with a modified notification node
4. (Optional) Add a simple section schema if the properties deserve grouping
5. Commit and test

**Code changes:**

```typescript
// src/model/graph-model.ts
export type NodeType =
  | // ... existing
  | "notification"
  | "unknown";

// src/render/section-schemas.ts (optional)
const notificationSchemas: SectionSchema[] = [
  {
    name: "Notification Settings",
    paths: ["recipientList", "subject", "body"],
    render: "lines"
  }
];

function getNodeTypeSchemas(nodeType: NodeType): SectionSchema[] {
  switch (nodeType) {
    case "notification":
      return notificationSchemas;
    // ...
  }
}
```

### Scenario 2: An existing element type gains new properties

Example: The `recordCreate` element gains a new `requiredFields` property.

**Steps:**

1. No type change needed (the element is still `"recordCreate"`)
2. The property is automatically diffed
3. (Optional) If `requiredFields` is a collection, add it to the section schema's columns
4. Create a fixture with a modified create element
5. Test

**Code changes:**

```typescript
// src/render/section-schemas.ts
const recordCreateSchemas: SectionSchema[] = [
  {
    name: "Field Mappings",
    paths: ["inputAssignments"],
    render: "table",
    columns: [
      { key: "field", label: "Field" },
      { key: "value", label: "Value", unwrap: true }
    ]
  },
  {
    name: "Required Fields",  // New section
    paths: ["requiredFields"],
    render: "table",
    columns: [
      { key: "name", label: "Field Name" }
    ]
  }
];
```

### Scenario 3: Salesforce changes element structure (nested arrays, new keys)

Example: A decision's `rules` array now includes a `metadata` object.

**Steps:**

1. No type change
2. The new `metadata` is automatically captured in property diffs
3. Inspect the parser output to understand the new structure
4. If the structure is complex, add a grouped-table schema
5. Create a fixture with the modified decision
6. Test

**Code changes:**

```typescript
// src/render/section-schemas.ts
const decisionSchemas: SectionSchema[] = [
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
  // If "rules[].metadata" needs special rendering, add another section
];
```

### Scenario 4: The parser doesn't understand the element

If the parser fails to parse the new element, it will fall back to `"unknown"`.

**Steps:**

1. Add `"unknown"` handling (already in `NodeType`)
2. Unknown elements still produce diffs, just classified as `type: "unknown"`
3. No special handling needed; the fallback is generic
4. Create a fixture with the unknown element
5. Test to confirm it parses without error

**Code:**

```typescript
// No code changes needed; the parser fallback handles it
// The element will appear as type: "unknown" in diffs
```

To improve support:
- **File an issue** with Google Flow Lens to request parser support
- **Or** add a custom parser pass in `build-model.ts` to handle the element

Example custom pass:

```typescript
// In buildGraphModel(), after parsing:
if (element.elementSubtype === "MyNewCustomElement") {
  element.type = "myCustomElement";  // Override unknown → custom type
}
```

## Debugging new types

If a new element type doesn't parse or diff correctly:

1. **Check the parser:**
   ```bash
   npx tsx src/cli.ts --old before.xml --new after.xml --json --out out/
   cat out/*.diff.json | jq '.nodes[] | select(.type == "myNewType")'
   ```

2. **Inspect the raw parsed structure:**
   - Add `console.log()` in `buildGraphModel()` to see the parsed element
   - Compare it against `src/parser/flow_types.ts` to see what fields are extracted

3. **Check canonicalization:**
   - Is the element's properties being stripped (coordinates, connectors)?
   - See `TOP_LEVEL_KEYS` and `EDGE_KEYS` in `build-model.ts`

4. **Verify the schema:**
   - Does the section schema have the correct property paths?
   - Do the column keys match the element's properties?

5. **Test with a fixture:**
   - Create a minimal fixture with only the new element type
   - Run the test to isolate the issue

## Checklist for adding a new type

- [ ] Added type name to `NodeType` union in `src/model/graph-model.ts`
- [ ] Verified parser supports it (or filed upstream issue)
- [ ] Created a fixture in `fixtures/diff/<case>/` with before/after flows
- [ ] Added test row in `test/semantic-diff.test.ts`
- [ ] (Optional) Added section schema in `src/render/section-schemas.ts`
- [ ] (Optional) Updated [docs/salesforce-flow-primer.md](salesforce-flow-primer.md) with element docs
- [ ] Ran `npm test` and verified it passes
- [ ] Ran `npm run render:fixtures` and visually inspected the HTML
- [ ] Committed the fixture and changes together

## Contributing upstream

If you extend the parser or add parser support:

1. **Test thoroughly** — parser changes affect all flows
2. **Keep parser edits minimal** — the parser is vendored; prefer building on top
3. **Coordinate with Google Flow Lens** — if the parser is missing a type, file an issue upstream
4. **Update NOTICE** — if you vendor a new parser version, update the commit hash

See [docs/vendoring.md](vendoring.md) for vendoring policy.

## References

- **Salesforce Flow metadata API:** https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/metaType_Flow.htm
- **Google Flow Lens (upstream parser):** https://github.com/google/flow-lens
- **Parser types:** `src/parser/flow_types.ts` (do not edit)
- **Section schema authoring:** [docs/section-schemas.md](section-schemas.md)
- **Data model:** [docs/data-model.md](data-model.md)
