import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isMainModule(metaUrl: string, argvPath = process.argv[1]): boolean {
  if (!argvPath) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
}
