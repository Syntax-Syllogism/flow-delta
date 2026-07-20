import { createInterface } from "node:readline/promises";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import type { FlowVersion } from "./io/read-flow-from-org.ts";

export interface FlowSelection {
  developerName: string;
  fromVersion: number;
  toVersion: number;
}

type PromptInput = NodeJS.ReadableStream;
type PromptOutput = NodeJS.WritableStream;

function formatTableRow(values: string[], widths: number[]): string {
  return values.map((value, index) => (index === values.length - 1 ? value : value.padEnd(widths[index]))).join("  ");
}

function displayVersionTable(versions: FlowVersion[]): string {
  const headers = ["#", "Version", "Status", "Label", "Last modified by", "Last modified date"];
  const rows = versions.map((version, index) => [
    String(index + 1),
    String(version.versionNumber),
    version.status,
    version.label || "(no label)",
    version.lastModifiedBy,
    version.lastModifiedDate,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  return [formatTableRow(headers, widths), ...rows.map((row) => formatTableRow(row, widths))].join("\n");
}

function parseChoice(input: string, versions: FlowVersion[]): number | undefined {
  const value = Number(input);
  if (!Number.isInteger(value)) {
    return undefined;
  }
  const byVersion = versions.find((version) => version.versionNumber === value);
  if (byVersion) {
    return byVersion.versionNumber;
  }
  return versions[value - 1]?.versionNumber;
}

export async function pickFlowAndVersions(
  allVersions: FlowVersion[],
  requestedDeveloperName?: string,
  input: PromptInput = defaultInput,
  output: PromptOutput = defaultOutput,
): Promise<FlowSelection> {
  if ((input as PromptInput & { isTTY?: boolean }).isTTY === false) {
    throw new Error(
      "Interactive org mode requires a TTY. Pin --flow, --from-version, and --to-version in non-interactive environments.",
    );
  }
  const prompt = createInterface({ input, output });
  try {
    let developerName = requestedDeveloperName;
    if (!developerName) {
      const names = [...new Set(allVersions.map((version) => version.developerName))];
      if (names.length === 0) {
        throw new Error("No Flow versions were found in the Salesforce org.");
      }
      output.write("Available flows:\n");
      names.forEach((name, index) => output.write(`${index + 1}. ${name}\n`));
      const choice = Number(await prompt.question("Select a flow number: "));
      developerName = names[choice - 1];
      if (!developerName) {
        throw new Error("Invalid flow selection.");
      }
    }

    const versions = allVersions.filter((version) => version.developerName === developerName);
    if (versions.length < 2) {
      throw new Error(`Flow ${developerName} does not have two versions to compare.`);
    }
    output.write(`${displayVersionTable(versions)}\n`);
    const latest = versions.slice(-2).map((version) => version.versionNumber);
    const answer = await prompt.question(
      `Enter two version numbers to compare (default ${latest[0]} ${latest[1]}): `,
    );
    const choices = (answer.trim() ? answer.trim().split(/[\s,]+/) : latest)
      .map((choice) => (typeof choice === "number" ? choice : parseChoice(choice, versions)))
      .filter((choice): choice is number => choice !== undefined);
    if (choices.length !== 2 || choices[0] === choices[1]) {
      throw new Error("Choose two different flow versions.");
    }
    return { developerName, fromVersion: choices[0], toVersion: choices[1] };
  } finally {
    prompt.close();
  }
}
