import { readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

const packageName = "@syntax-syllogism/flow-delta";
let cachedVersion: string | undefined;

export function packageVersion(): string {
  if (cachedVersion) return cachedVersion;

  let directory = dirname(fileURLToPath(import.meta.url));
  const root = parse(directory).root;
  while (true) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as {
        name?: string;
        version?: string;
      };
      if (manifest.name === packageName && manifest.version) {
        cachedVersion = manifest.version;
        return cachedVersion;
      }
    } catch {
      // Keep walking until the package manifest is found.
    }

    const parent = dirname(directory);
    if (parent === directory || directory === root) break;
    directory = parent;
  }
  throw new Error(`Could not find package.json for ${packageName}`);
}

export function versionLine(bin: string): string {
  return `${bin} ${packageVersion()}`;
}
