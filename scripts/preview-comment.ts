import { parseArgs } from "node:util";
import { FlowParser } from "../src/parser/flow_parser.ts";
import { buildModel } from "../src/model/build-model.ts";
import { extractFlowHeader } from "../src/model/flow-header.ts";
import { diffModel } from "../src/diff/diff-model.ts";
import { readMetadataFromFile } from "../src/io/read-metadata.ts";
import { parseFlexiPage } from "../src/flexipage/parse.ts";
import { diffPage } from "../src/flexipage/diff-page.ts";
import { safeFileName } from "../src/util/file-name.ts";
import { isMainModule } from "../src/util/is-main-module.ts";
import { buildComment, buildFlexiPageComment, type FlowResult, type FlexiPageResult } from "../src/ci/report-core.ts";

const USAGE = `Usage:
  npm run preview:comment -- --product flow --old <before.flow-meta.xml> --new <after.flow-meta.xml> [--old <before2>... --new <after2>...] [--commit-sha <sha>] [--artifact-url-base <url>]
  npm run preview:comment -- --product flexipage --old <before.flexipage-meta.xml> --new <after.flexipage-meta.xml> [...] [--commit-sha <sha>] [--artifact-url-base <url>]

Renders the exact FlowDelta/FlexiPageDelta PR/MR comment markdown for one or more before/after file pairs, without building a tarball, spinning up a sample repo, or pushing anywhere.
`;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs({
    args: argv,
    options: {
      product: { type: "string" },
      old: { type: "string", multiple: true },
      new: { type: "string", multiple: true },
      "commit-sha": { type: "string" },
      "artifact-url-base": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  if (parsed.values.help) {
    console.log(USAGE.trimEnd());
    return;
  }

  try {
    const product = parsed.values.product;
    const olds = parsed.values.old ?? [];
    const news = parsed.values.new ?? [];
    const artifactUrlBase = parsed.values["artifact-url-base"] ?? "https://example.test";

    if (product !== "flow" && product !== "flexipage") {
      throw new Error("Specify --product flow or --product flexipage");
    }
    if (olds.length === 0 || olds.length !== news.length) {
      throw new Error("Provide an equal, non-zero number of --old and --new file paths");
    }

    const comment = product === "flow"
      ? buildComment(await buildFlowResults(olds, news, artifactUrlBase), { commitSha: parsed.values["commit-sha"] })
      : buildFlexiPageComment(await buildFlexiPageResults(olds, news, artifactUrlBase), { commitSha: parsed.values["commit-sha"] });

    console.log(comment);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

async function buildFlowResults(olds: string[], news: string[], artifactUrlBase: string): Promise<FlowResult[]> {
  const results: FlowResult[] = [];
  for (let index = 0; index < olds.length; index += 1) {
    const oldModel = await buildFlowModelWithHeader(olds[index]);
    const newModel = await buildFlowModelWithHeader(news[index]);
    const diff = diffModel(oldModel, newModel);
    results.push({
      flowName: diff.flowName,
      summary: diff.summary,
      flowChanges: diff.flowChanges,
      artifactUrl: `${artifactUrlBase}/${safeFileName(diff.flowName)}.html`,
    });
  }
  return results;
}

async function buildFlowModelWithHeader(path: string) {
  const xml = readMetadataFromFile(path);
  const model = buildModel(await new FlowParser(xml).generateFlowDefinition());
  model.header = await extractFlowHeader(xml);
  return model;
}

async function buildFlexiPageResults(olds: string[], news: string[], artifactUrlBase: string): Promise<FlexiPageResult[]> {
  const results: FlexiPageResult[] = [];
  for (let index = 0; index < olds.length; index += 1) {
    const oldModel = await parseFlexiPage(readMetadataFromFile(olds[index]));
    const newModel = await parseFlexiPage(readMetadataFromFile(news[index]));
    const diff = diffPage(oldModel, newModel);
    results.push({
      pageName: diff.pageName,
      summary: diff.summary,
      pageChanges: diff.pageChanges,
      artifactUrl: `${artifactUrlBase}/${safeFileName(diff.pageName)}.html`,
    });
  }
  return results;
}

if (isMainModule(import.meta.url)) {
  void main();
}
