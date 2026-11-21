import type { NodeType } from "./graph-model.ts";

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  start: "Start",
  end: "End",
  assignment: "Assignment",
  decision: "Decision",
  loop: "Loop",
  recordLookup: "Get Records",
  recordCreate: "Create Records",
  recordUpdate: "Update Records",
  recordDelete: "Delete Records",
  screen: "Screen",
  subflow: "Subflow",
  actionCall: "Action",
  apexPluginCall: "Apex Plugin",
  wait: "Wait",
  step: "Step",
  orchestratedStage: "Orchestrated Stage",
  transform: "Transform",
  collectionProcessor: "Collection Processor",
  customError: "Custom Error",
  recordRollback: "Roll Back",
  unknown: "Unknown",
};

type SummaryHeader = { processType?: string };
type Summary = (props: Record<string, unknown>, header?: SummaryHeader) => string;

const TRIGGERS: Record<string, string> = {
  RecordBeforeSave: "Before save",
  RecordAfterSave: "After save",
  RecordBeforeDelete: "Before delete",
  Scheduled: "Scheduled",
  PlatformEvent: "Platform event",
};
const PROCESSES: Record<string, string> = {
  Flow: "Screen flow",
  AutoLaunchedFlow: "Autolaunched flow",
  Workflow: "Process",
};

function items(value: unknown): unknown[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function reference(value: unknown): string {
  const name = text(value);
  return name ? `{!${name}}` : "";
}

function count(n: number, noun: string): string {
  const plural = noun.endsWith("y") && !/[aeiou]y$/.test(noun) ? noun.slice(0, -1) + "ies" : noun + "s";
  return `${n} ${n === 1 ? noun : plural}`;
}

function messageText(value: unknown): string {
  if (value && typeof value === "object" && !("$" in value)) {
    return messageText(Object.values(value)[0]);
  }
  return text(value);
}

const recordTarget: Summary = (p) => text(p.object) || reference(p.inputReference);
const action: Summary = (p) => [text(p.actionType), text(p.actionName)].filter(Boolean).join(" · ");

const SUMMARIES: Partial<Record<NodeType, Summary>> = {
  start: (p, header) => {
    const object = text(p.object);
    const trigger = text(p.triggerType);
    const event = text(p.recordTriggerType);
    if (object) {
      return [object, TRIGGERS[trigger] ?? trigger, event === "CreateAndUpdate" ? "Create/Update" : event]
        .filter(Boolean)
        .join(" · ");
    }
    const process = header?.processType ?? "";
    return PROCESSES[process] ?? process;
  },
  decision: (p) => `${count(items(p.rules).length, "outcome")} + default`,
  assignment: (p) => count(items(p.assignmentItems).length, "assignment"),
  loop: (p) => (p.collectionReference ? `Each in ${reference(p.collectionReference)}` : ""),
  recordLookup: (p) => {
    const filters = items(p.filters).length;
    const first = p.getFirstRecordOnly === "true" || p.getFirstRecordOnly === true;
    return [text(p.object), first ? "first record" : "all records", filters ? count(filters, "filter") : ""]
      .filter(Boolean)
      .join(" · ");
  },
  recordCreate: recordTarget,
  recordUpdate: (p) => {
    const fields = items(p.inputAssignments).length;
    return [recordTarget(p), fields ? count(fields, "field") : ""].filter(Boolean).join(" · ");
  },
  recordDelete: recordTarget,
  screen: (p) => count(items(p.fields).length, "component"),
  subflow: (p) => (p.flowName ? `Runs ${text(p.flowName)}` : ""),
  actionCall: action,
  apexPluginCall: action,
  customError: (p) => {
    const messages = items(p.customErrorMessages);
    if (messages.length > 1) return count(messages.length, "message");
    const [message] = messages;
    const value =
      message && typeof message === "object" && "errorMessage" in message ? messageText(message.errorMessage) : "";
    return value.trim() ? `"${value}"` : "No message set";
  },
  collectionProcessor: (p) => {
    const collection = reference(p.collectionReference);
    if (!collection) return "";
    const operation = p.collectionProcessorType === "SortCollectionProcessor" ? "Sort" : "Filter";
    return `${operation} ${collection}`;
  },
  wait: (p) => count(items(p.waitEvents).length, "event"),
};

export function nodeSummary(type: NodeType, props: Record<string, unknown>, header?: SummaryHeader): string {
  return SUMMARIES[type]?.(props, header) || NODE_TYPE_LABELS[type];
}

const CHANGE_NOUNS: Record<string, string> = {
  assignmentItems: "assignment",
  inputParameters: "input parameter",
  outputParameters: "output parameter",
  outputAssignments: "output assignment",
  waitEvents: "event",
  conditions: "condition",
  customErrorMessages: "message",
  fields: "field",
  filters: "filter",
  inputAssignments: "field",
  rules: "outcome",
};

export function changeSummary(node: {
  changes?: readonly { path: string; before: unknown; after: unknown }[];
}): string {
  const groups = new Map<string, { sign: string; noun: string; total: number }>();
  for (const change of node.changes ?? []) {
    const segment = change.path.split(".").at(-1) ?? "";
    const leaf = segment.replace(/\[\d+\]$/, "") || "property";
    const name = leaf.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    const noun = CHANGE_NOUNS[leaf] ?? (leaf === segment ? name : name.replace(/ies$/, "y").replace(/(?<!s)s$/, ""));
    const sign = change.before === undefined ? "+" : change.after === undefined ? "−" : "";
    const key = sign + noun;
    const group = groups.get(key) ?? { sign, noun, total: 0 };
    group.total += 1;
    groups.set(key, group);
  }
  const parts = [...groups.values()].map(({ sign, noun, total }) =>
    sign ? sign + count(total, noun) : count(total, noun) + " changed",
  );
  if (parts.length === 0) return "Changed";
  if (parts.length > 2) return [...parts.slice(0, 2), `+${parts.length - 2} more`].join(" · ");
  return parts.join(" · ");
}
