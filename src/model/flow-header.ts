import { Parser } from "xml2js";

export interface FlowHeader {
  status?: string;
  processType?: string;
  runInMode?: string;
  apiVersion?: string;
  triggerOrder?: string;
  description?: string;
  interviewLabel?: string;
  isTemplate?: string;
}

export const FLOW_HEADER_KEYS = [
  "status",
  "processType",
  "runInMode",
  "apiVersion",
  "triggerOrder",
  "description",
  "interviewLabel",
  "isTemplate",
] as const;

type FlowHeaderKey = typeof FLOW_HEADER_KEYS[number];

export async function extractFlowHeader(xml: string): Promise<FlowHeader> {
  try {
    const parsed = await new Parser({ explicitArray: false }).parseStringPromise(xml) as { Flow?: Record<string, unknown> };
    const flow = parsed.Flow;
    if (!flow) {
      return {};
    }

    const header: FlowHeader = {};
    for (const key of FLOW_HEADER_KEYS) {
      const value = flow[key];
      if (value !== undefined && (value === null || typeof value !== "object")) {
        header[key as FlowHeaderKey] = String(value);
      }
    }
    return header;
  } catch {
    return {};
  }
}
