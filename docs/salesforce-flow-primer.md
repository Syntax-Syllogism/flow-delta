---
title: Salesforce Flow XML Primer
description: Flow metadata structure, elements, connectors, and parsing.
---

# Salesforce Flow XML Primer

FlowDelta parses `.flow-meta.xml` files, which are the metadata representation of Salesforce Flows. This primer explains the XML structure so you can understand what FlowDelta is parsing and comparing.

## What is a Flow?

A Flow is a Salesforce automation that executes a series of steps (elements) in response to an event or user interaction. Flows can query records, create/update records, call APIs, show screens, and make conditional decisions.

The `.flow-meta.xml` file is the metadata representation of a flow's logic, serialized by Salesforce when you export the flow.

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

- `<apiVersion>` — Salesforce API version (60.0 = Spring '24, etc.)
- `<label>` — The display name shown in the UI
- `<status>` — Active or Draft
- `<start>` — Entry point (where the flow begins)
- `<processMetadataValues>` — Flow-level metadata (not diffed by FlowDelta)

## Elements (nodes)

Each element is an action or decision in the flow. Elements are identified by a unique `<name>` (the API name, used internally) and a `<label>` (the display label).

### Start element

```xml
<start>
    <connector>
        <targetReference>MyFirstStep</targetReference>
    </connector>
    <label>Start</label>
</start>
```

The flow entry point. Always named `Start` and typically has one outgoing connector.

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

- `<assignmentItems>` — Array of assignments (variable = value)
- `<connector>` — The next step to execute

### Decision

A branching point (if/else logic).

```xml
<elements>
    <name>MyDecision</name>
    <label>Is User Active?</label>
    <locationX>300</locationY>
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

- `<rules>` — Each outcome (branch). Named by the outcome, contains conditions.
- `<conditions>` — Logical tests (leftValue operator rightValue)
- `<connector>` — Where to go if this outcome is true
- `<defaultConnector>` — Fallback if no rules match
- Common operators: `Equals`, `NotEquals`, `GreaterThan`, `LessThan`, `Contains`, `StartsWith`, etc.

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

- `<filters>` — WHERE clause conditions
- `<object>` — Salesforce object (Account, Contact, etc.)
- `<outputAssignments>` — Variables to populate with query results
- `<getFirstRecordOnly>` — Return one record (vs. all)

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

- `<inputAssignments>` — Field assignments (field = value)
- `<object>` — Salesforce object to create/update
- `<storeOutputFragment>` — Save the result for later reference

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

Invokes a Salesforce Action or extension.

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

- `<actionName>` — Built-in action (emailSimple, quickAction, etc.)
- `<inputParameters>` — Arguments passed to the action

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

- `<collectionReference>` — The collection to iterate over
- `<nextValueConnector>` — Steps to run for each item
- `<noMoreValuesConnector>` — Steps to run after all items

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

Salesforce also includes:

- `<transform>` — Map data between formats
- `<collectionProcessor>` — Process collections (filter, sort, count)
- `<orchestratedStage>` — Orchestration support
- `<step>` — Legacy (mostly deprecated)
- `<apexPluginCall>` — Call custom Apex
- `<customError>` — Throw a custom error
- `<recordRollback>` — Undo DML operations

## Connections (edges)

Connections define the flow of execution between elements.

```xml
<connector>
    <targetReference>NextStepName</targetReference>
</connector>
```

**Types:**

- `<connector>` — Normal flow (primary outcome)
- `<faultConnector>` — Error path (if action fails)
- `<defaultConnector>` — Fallback in decision (no rules matched)

**Attributes** (inferred by FlowDelta):

- **Kind:** `normal` or `fault`
- **Label:** The outcome name (from decision rules) or connector name

## Typed values

Salesforce wraps scalar values in type-discriminator objects:

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

FlowDelta unwraps these in the UI for readability.

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

- `<dataType>` — String, Number, Boolean, SObject, Record, etc.
- `<isCollection>` — Single value or list
- `<isInput>` / `<isOutput>` — Flow input/output parameters

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

Elements have UI positioning properties that don't affect logic:

```xml
<locationX>100</locationX>
<locationY>200</locationY>
```

These are stripped during canonicalization so cosmetic repositioning doesn't produce a diff.

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

1. **Parser** (`src/parser/flow_parser.ts`) — Converts XML to `ParsedFlow` with element collections and transitions
2. **Model** (`src/model/build-model.ts`) — Normalizes to `GraphModel` (nodes + edges, stripped of coordinates and connectors)
3. **Diff** (`src/diff/diff-model.ts`) — Compares two `GraphModel`s and produces `FlowDiff` with per-property changes
4. **Render** (`src/render/render-html.ts`) — Transforms `FlowDiff` into interactive HTML

The canonicalization step ensures that coordinate changes, reordering of connector definitions, and similar cosmetic edits **don't** produce spurious diffs.

## Key differences from visual representation

- **Node identity:** Nodes are matched by `<name>` (API name), not `<label>` (display label). Renaming a node reads as delete + add.
- **Edges as separate objects:** Connections are represented as `GraphEdge` objects, not properties of nodes.
- **No subflow traversal:** Subflow calls are opaque nodes (referenced by name); the called flow isn't expanded.
- **Synthetic start/end:** FlowDelta creates virtual `start` and `end` nodes for graph consistency.

## References

- **Salesforce Flow XML docs** (official): https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/metaType_Flow.htm
- **Google Flow Lens** (upstream parser): https://github.com/google/flow-lens
- **FlowDelta architecture:** [docs/architecture.md](architecture.md)
- **Data model types:** [docs/data-model.md](data-model.md)
