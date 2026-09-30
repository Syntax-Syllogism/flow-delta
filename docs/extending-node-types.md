---
title: Extending FlowDelta for New Salesforce Node Types
description: Add semantic support for Salesforce Flow element types.
---

# Extending FlowDelta for New Salesforce Node Types

Use this guide when Salesforce ships a new Flow element type, or an existing type gains new properties.

## Overview

Supporting a new node type takes up to four steps:

1. **Declare the type** in `src/model/graph-model.ts`, if it isn't there yet.
2. **Verify parsing.** Confirm the vendored parser handles it.
3. **Add a section schema** (optional) for better rendering.
4. **Add test coverage.**

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

- Use lowercase camelCase.
- Use the exact element name from the Salesforce XML.
- Add a test fixture (see Step 4).

## Step 2: Verify parser support

The parser is vendored from Google Flow Lens. It lives in `src/parser/flow_types.ts`, which is read-only. Check whether it already defines the new element type:

```bash
grep "myNewType" src/parser/flow_types.ts
```

**If it's there,** the parser handles the element. Go to Step 3.

**If it's not,** the parser may not recognize the element. You have two options:

1. **Open an upstream issue** with Google Flow Lens and ask them to add the type.
2. **Add a fallback in `src/model/build-model.ts`** that catches unknown elements as `"unknown"`.

The parser already falls back for unrecognized types, so parsing won't fail. Unknown elements are parsed, but classified as `type: "unknown"` in the `GraphModel`.

## Step 3: Add a section schema (optional)

If the new type has domain-specific properties that should show as semantic sections (for example "Filters" or "Outcomes"), add a section schema in `src/render/section-schemas.ts`:

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

See [section-schemas.md](section-schemas.md) for details.

**If you skip this step,** the diff still works. Changed properties appear in the generic `"Configuration"` fallback section. The rendering is less polished, but correct.

## Step 4: Add test coverage

Create a fixture with the new element in both the before and after versions:

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

Open `flow-delta-out/fixtures/my_new_type.html` in a browser and check the rendering.

## Common scenarios

### Scenario 1: a new node type with simple properties

Example: a new `"notification"` element that sends notifications.

1. Add `"notification"` to `NodeType` in `graph-model.ts`.
2. Check whether the parser supports it (run the test suite).
3. Create a fixture with a modified notification node.
4. Optionally, add a simple section schema if the properties deserve grouping.
5. Commit and test.

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

### Scenario 2: an existing type gains new properties

Example: `recordCreate` gains a `requiredFields` property.

1. No type change is needed. The element is still `"recordCreate"`.
2. The new property is diffed automatically.
3. Optionally, if `requiredFields` is a collection, add a section for it.
4. Create a fixture with a modified create element.
5. Test.

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

### Scenario 3: Salesforce changes an element's structure

Example: a decision's `rules` array now includes a `metadata` object.

1. No type change.
2. The new `metadata` is captured in property diffs automatically.
3. Inspect the parser output to understand the new structure.
4. If the structure is complex, add a grouped-table schema.
5. Create a fixture with the modified decision.
6. Test.

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

### Scenario 4: the parser doesn't understand the element

If the parser can't parse the new element, it falls back to `"unknown"`.

1. `"unknown"` is already in `NodeType`.
2. Unknown elements still produce diffs, classified as `type: "unknown"`.
3. No special handling is needed. The fallback is generic.
4. Create a fixture with the unknown element.
5. Run the tests to confirm it parses without error.

No code changes are needed. The element appears as `type: "unknown"` in diffs.

To improve support, either:

- **file an issue** with Google Flow Lens to request parser support; or
- **add a custom parser pass** in `build-model.ts` to handle the element.

Example custom pass:

```typescript
// In buildGraphModel(), after parsing:
if (element.elementSubtype === "MyNewCustomElement") {
  element.type = "myCustomElement";  // Override unknown → custom type
}
```

## Debugging new types

If a new element type doesn't parse or diff correctly:

1. **Check the diff output.**

   ```bash
   npx tsx src/cli.ts --old before.xml --new after.xml --json --out out/
   cat out/*.diff.json | jq '.nodes[] | select(.type == "myNewType")'
   ```

2. **Inspect the parsed structure.** Add `console.log()` in `buildGraphModel()` to see the parsed element. Compare it with `src/parser/flow_types.ts` to see which fields are extracted.
3. **Check canonicalization.** Are the element's properties being stripped (coordinates, connectors)? See `TOP_LEVEL_KEYS` and `EDGE_KEYS` in `build-model.ts`.
4. **Check the schema.** Are the property paths and column keys right?
5. **Use a minimal fixture.** Make one with only the new element type, and run the test to isolate the issue.

## Checklist

- [ ] Added the type name to the `NodeType` union in `src/model/graph-model.ts`
- [ ] Verified the parser supports it (or filed an upstream issue)
- [ ] Created a fixture in `fixtures/diff/<case>/` with before/after flows
- [ ] Added a test row in `test/semantic-diff.test.ts`
- [ ] (Optional) Added a section schema in `src/render/section-schemas.ts`
- [ ] (Optional) Updated [salesforce-flow-primer.md](salesforce-flow-primer.md) with element docs
- [ ] Ran `npm test` and it passes
- [ ] Ran `npm run render:fixtures` and checked the HTML by eye
- [ ] Committed the fixture and code changes together

## Contributing upstream

If you extend the parser or add parser support:

1. **Test thoroughly.** Parser changes affect every flow.
2. **Keep parser edits minimal.** The parser is vendored, so build on top of it where you can.
3. **Coordinate with Google Flow Lens.** If the parser lacks a type, file an issue upstream.
4. **Update NOTICE.** If you vendor a new parser version, update the commit hash.

See [vendoring.md](vendoring.md) for the vendoring policy.

## References

- [Salesforce Flow metadata API](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/metaType_Flow.htm)
- [Google Flow Lens (upstream parser)](https://github.com/google/flow-lens)
- Parser types: `src/parser/flow_types.ts` (do not edit)
- Section schema authoring: [section-schemas.md](section-schemas.md)
- Data model: [data-model.md](data-model.md)
