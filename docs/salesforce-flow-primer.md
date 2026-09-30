---
title: Salesforce Flow XML Primer
description: Flow metadata structure, elements, connectors, and parsing.
---

# Salesforce Flow XML Primer

FlowDelta parses `.flow-meta.xml` files, the metadata form of Salesforce Flows. This primer explains the XML, so you know what FlowDelta parses and compares.

## What is a Flow?

A Flow is a Salesforce automation. It runs a series of steps (elements) in response to an event or a user action. A Flow can query records, create or update records, call APIs, show screens, and branch on conditions.

The `.flow-meta.xml` file is the flow's logic as metadata. Salesforce writes it when you export the flow.

## Top-level structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>60.0</apiVersion>
    <description>...</description>
    <label>Display Name</label>
    <processMetadataValues>...</processMetadataValues>
    <start>
        <connector>
            <targetReference>FirstElementName</targetReference>
        </connector>
        <label>Start</label>
    </start>
    <status>Draft</status>
    <!-- Elements go here -->
</Flow>
```

**Key attributes:**

- `<apiVersion>`: the Salesforce API version (60.0 = Spring '24, and so on).
- `<label>`: the display name shown in the UI.
- `<status>`: Active or Draft.
- `<start>`: the entry point, where the flow begins.
- `<processMetadataValues>`: flow-level metadata (not diffed by FlowDelta).

## Elements (nodes)

Each element is a step or decision in the flow. It has a unique `<name>` (the API name, used internally) and a `<label>` (the display label).

### Start element

```xml
<start>
    <connector>
        <targetReference>MyFirstStep</targetReference>
    </connector>
    <label>Start</label>
</start>
```

The flow's entry point. It's always named `Start` and usually has one outgoing connector.

### Assignment

Assigns values to variables.

```xml
<elements>
    <name>MyAssignment</name>
    <label>Update Variables</label>
    <locationX>100</locationX>
    <locationY>200</locationY>
    <assignmentItems>
        <assignToReference>myVariable</assignToReference>
        <operator>Assign</operator>
        <value>
            <stringValue>Hello World</stringValue>
        </value>
    </assignmentItems>
    <connector>
        <targetReference>NextStep</targetReference>
    </connector>
</elements>
```

**Key properties:**

- `<assignmentItems>`: the assignments (variable = value).
- `<connector>`: the next step to run.

### Decision

A branching point (if/else logic).

```xml
<elements>
    <name>MyDecision</name>
    <label>Is User Active?</label>
    <locationX>300</locationX>
    <rules>
        <name>YesOutcome</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>userStatus</leftValueReference>
            <operator>Equals</operator>
            <rightValue>
                <stringValue>Active</stringValue>
            </rightValue>
        </conditions>
        <connector>
            <targetReference>DoSomething</targetReference>
        </connector>
    </rules>
    <rules>
        <name>NoOutcome</name>
        <conditionLogic>and</conditionLogic>
        <conditions>
            <leftValueReference>userStatus</leftValueReference>
            <operator>NotEquals</operator>
            <rightValue>
                <stringValue>Active</stringValue>
            </rightValue>
        </conditions>
        <connector>
            <targetReference>DoSomethingElse</targetReference>
        </connector>
    </rules>
    <defaultConnectorLabel>Default</defaultConnectorLabel>
    <defaultConnector>
        <targetReference>DefaultStep</targetReference>
    </defaultConnector>
</elements>
```

**Key properties:**

- `<rules>`: one per outcome (branch). Named for the outcome, and holds its conditions.
- `<conditions>`: the tests (leftValue operator rightValue).
- `<connector>`: where to go if this outcome is true.
- `<defaultConnector>`: the fallback if no rule matches.
- Common operators: `Equals`, `NotEquals`, `GreaterThan`, `LessThan`, `Contains`, `StartsWith`, and so on.

### Record operations

#### Record Lookup (query)

```xml
<elements>
    <name>GetAccount</name>
    <label>Get Account Details</label>
    <filterLogic>and</filterLogic>
    <filters>
        <field>Id</field>
        <operator>Equals</operator>
        <value>
            <elementReference>accountId</elementReference>
        </value>
    </filters>
    <getFirstRecordOnly>true</getFirstRecordOnly>
    <object>Account</object>
    <storeOutputFragment>true</storeOutputFragment>
    <outputAssignments>
        <assignToReference>accountVar</assignToReference>
        <field>Industry</field>
    </outputAssignments>
    <connector>
        <targetReference>ProcessAccount</targetReference>
    </connector>
</elements>
```

**Key properties:**

- `<filters>`: the WHERE clause conditions.
- `<object>`: the Salesforce object (Account, Contact, and so on).
- `<outputAssignments>`: the variables to fill with the query results.
- `<getFirstRecordOnly>`: return one record instead of all.

#### Record Create / Update

```xml
<elements>
    <name>CreateContact</name>
    <label>Create New Contact</label>
    <inputAssignments>
        <field>FirstName</field>
        <value>
            <elementReference>firstName</elementReference>
        </value>
    </inputAssignments>
    <inputAssignments>
        <field>Email</field>
        <value>
            <stringValue>user@example.com</stringValue>
        </value>
    </inputAssignments>
    <object>Contact</object>
    <storeOutputFragment>true</storeOutputFragment>
    <connector>
        <targetReference>NextStep</targetReference>
    </connector>
</elements>
```

**Key properties:**

- `<inputAssignments>`: the field assignments (field = value).
- `<object>`: the Salesforce object to create or update.
- `<storeOutputFragment>`: save the result for later reference.

#### Record Delete

```xml
<elements>
    <name>DeleteAccount</name>
    <label>Delete Old Account</label>
    <filterLogic>and</filterLogic>
    <filters>
        <field>CreatedDate</field>
        <operator>LessThan</operator>
        <value>
            <elementReference>cutoffDate</elementReference>
        </value>
    </filters>
    <object>Account</object>
    <connector>
        <targetReference>NextStep</targetReference>
    </connector>
</elements>
```

### Screen

Shows a UI to the user.

```xml
<elements>
    <name>ConfirmAction</name>
    <label>Confirm Your Action</label>
    <allowBack>false</allowBack>
    <allowFinish>true</allowFinish>
    <showFooter>true</showFooter>
    <showHeader>true</showHeader>
    <connector>
        <targetReference>ProcessUserInput</targetReference>
    </connector>
</elements>
```

### Action Call

Runs a Salesforce Action or extension.

```xml
<elements>
    <name>SendEmail</name>
    <label>Send Email Notification</label>
    <actionName>emailSimple</actionName>
    <actionType>emailSimple</actionType>
    <inputParameters>
        <name>emailAddresses</name>
        <value>
            <elementReference>userEmail</elementReference>
        </value>
    </inputParameters>
    <inputParameters>
        <name>emailBody</name>
        <value>
            <stringValue>Your flow ran successfully.</stringValue>
        </value>
    </inputParameters>
    <connector>
        <targetReference>NextStep</targetReference>
    </connector>
</elements>
```

**Key properties:**

- `<actionName>`: the built-in action (emailSimple, quickAction, and so on).
- `<inputParameters>`: the arguments passed to the action.

### Subflow Call

Calls another flow.

```xml
<elements>
    <name>NestedFlow</name>
    <label>Call Helper Flow</label>
    <subflowInput>
        <name>inputVar</name>
        <value>
            <elementReference>myVariable</elementReference>
        </value>
    </subflowInput>
    <subflowOutputAssignments>
        <assignToReference>resultVar</assignToReference>
        <name>outputVar</name>
    </subflowOutputAssignments>
    <subflowReference>HelperFlow</subflowReference>
    <connector>
        <targetReference>NextStep</targetReference>
    </connector>
</elements>
```

### Loop

Repeats a set of steps.

```xml
<elements>
    <name>ProcessRecords</name>
    <label>Loop Through Records</label>
    <collectionReference>recordList</collectionReference>
    <iterationOrder>Asc</iterationOrder>
    <nextValueConnector>
        <targetReference>ProcessSingleRecord</targetReference>
    </nextValueConnector>
    <noMoreValuesConnector>
        <targetReference>AllDone</targetReference>
    </noMoreValuesConnector>
</elements>
```

**Key properties:**

- `<collectionReference>`: the collection to loop over.
- `<nextValueConnector>`: the steps to run for each item.
- `<noMoreValuesConnector>`: the steps to run after the last item.

### Wait

Pauses flow execution.

```xml
<elements>
    <name>WaitTwoHours</name>
    <label>Wait 2 Hours</label>
    <timeoutConnector>
        <targetReference>ProcessTimeout</targetReference>
    </timeoutConnector>
    <waitEvents>
        <name>MyEvent</name>
        <eventType>AlmEvent</eventType>
        <inputParameters>
            <name>sourceId</name>
            <value>
                <elementReference>recordId</elementReference>
            </value>
        </inputParameters>
        <connector>
            <targetReference>EventOccurred</targetReference>
        </connector>
    </waitEvents>
    <connector>
        <targetReference>AfterWait</targetReference>
    </connector>
</elements>
```

### Other element types

Salesforce has more element types:

- `<transform>`: map data between formats.
- `<collectionProcessor>`: process collections (filter, sort, count).
- `<orchestratedStage>`: orchestration support.
- `<step>`: legacy, mostly deprecated.
- `<apexPluginCall>`: call custom Apex.
- `<customError>`: throw a custom error.
- `<recordRollback>`: undo DML operations.

## Connections (edges)

Connections set the order of execution between elements.

```xml
<connector>
    <targetReference>NextStepName</targetReference>
</connector>
```

**Types:**

- `<connector>`: the normal path (the primary outcome).
- `<faultConnector>`: the error path, if an action fails.
- `<defaultConnector>`: the decision fallback, when no rule matched.

**Attributes** (inferred by FlowDelta):

- **Kind:** `normal` or `fault`.
- **Label:** the outcome name (from decision rules) or connector name.

## Typed values

Salesforce wraps scalar values in objects that name their type:

```xml
<!-- String -->
<value>
    <stringValue>Hello</stringValue>
</value>

<!-- Boolean -->
<value>
    <booleanValue>true</booleanValue>
</value>

<!-- Number -->
<value>
    <numberValue>42</numberValue>
</value>

<!-- Reference to a variable or field -->
<value>
    <elementReference>myVariable</elementReference>
</value>

<!-- Reference to a flow input/output -->
<value>
    <textValue>{!$Flow.CurrentRecord.Phone}</textValue>
</value>

<!-- Complex object (for subflow inputs, etc.) -->
<value>
    <complexValue>
        <apex>SomeApexClass</apex>
        <composite>...</composite>
    </complexValue>
</value>
```

FlowDelta unwraps these in the UI.

## Variables

Variables store state during flow execution.

```xml
<variables>
    <name>myVar</name>
    <dataType>String</dataType>
    <isCollection>false</isCollection>
    <isInput>false</isInput>
    <isOutput>false</isOutput>
    <value>
        <stringValue>initial value</stringValue>
    </value>
</variables>
```

**Key properties:**

- `<dataType>`: String, Number, Boolean, SObject, Record, and so on.
- `<isCollection>`: a single value or a list.
- `<isInput>` / `<isOutput>`: flow input and output parameters.

## Metadata values

Flow-level metadata (not diffed by FlowDelta):

```xml
<processMetadataValues>
    <name>BuilderVersion</name>
    <value>...</value>
</processMetadataValues>
```

Examples: `BuilderVersion`, `CanvasMode`, `OriginBuilderType`, etc.

## Coordinates (cosmetic noise)

Elements have canvas position properties that don't affect logic:

```xml
<locationX>100</locationX>
<locationY>200</locationY>
```

Canonicalization strips these, so moving an element on the canvas doesn't produce a diff.

## Example flow (minimal)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>60.0</apiVersion>
    <label>Simple Decision Flow</label>
    <processType>Flow</processType>
    <start>
        <connector>
            <targetReference>CheckStatus</targetReference>
        </connector>
        <label>Start</label>
    </start>
    <status>Active</status>
    <variables>
        <name>userStatus</name>
        <dataType>String</dataType>
        <value>
            <stringValue>Active</stringValue>
        </value>
    </variables>
    <elements>
        <name>CheckStatus</name>
        <label>Is User Active?</label>
        <rules>
            <name>ActiveUser</name>
            <conditionLogic>and</conditionLogic>
            <conditions>
                <leftValueReference>userStatus</leftValueReference>
                <operator>Equals</operator>
                <rightValue>
                    <stringValue>Active</stringValue>
                </rightValue>
            </conditions>
            <connector>
                <targetReference>DoSomething</targetReference>
            </connector>
        </rules>
        <defaultConnectorLabel>Default</defaultConnectorLabel>
        <defaultConnector>
            <targetReference>End</targetReference>
        </defaultConnector>
    </elements>
    <elements>
        <name>DoSomething</name>
        <label>Process Active User</label>
        <actionName>emailSimple</actionName>
        <actionType>emailSimple</actionType>
        <connector>
            <targetReference>End</targetReference>
        </connector>
    </elements>
    <elements>
        <name>End</name>
        <label>End</label>
    </elements>
</Flow>
```

## How FlowDelta uses this

1. **Parser** (`src/parser/flow_parser.ts`): converts XML to `ParsedFlow`, with element collections and transitions.
2. **Model** (`src/model/build-model.ts`): normalizes to a `GraphModel` (nodes and edges, with coordinates and connectors stripped).
3. **Diff** (`src/diff/diff-model.ts`): compares two `GraphModel`s and produces a `FlowDiff` with per-property changes.
4. **Render** (`src/render/render-html.ts`): turns the `FlowDiff` into interactive HTML.

Canonicalization means coordinate changes, reordered connector definitions, and similar cosmetic edits **don't** produce false diffs.

## Differences from the Flow Builder canvas

- **Node identity:** nodes match by `<name>` (API name), not `<label>` (display label). Renaming a node reads as a delete plus an add.
- **Edges are separate objects:** connections are `GraphEdge` objects, not properties of nodes.
- **No subflow traversal:** a subflow call is an opaque node, referenced by name. The called flow isn't expanded.
- **Virtual start and end:** FlowDelta adds `start` and `end` nodes to keep the graph consistent.

## References

- [Salesforce Flow XML docs](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/metaType_Flow.htm) (official)
- [Google Flow Lens](https://github.com/google/flow-lens) (upstream parser)
- FlowDelta architecture: [architecture.md](architecture.md)
- Data model types: [data-model.md](data-model.md)
