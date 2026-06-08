export interface PropertyChange {
  path: string;
  before: unknown;
  after: unknown;
}

export function deepDiff(before: unknown, after: unknown, path = ""): PropertyChange[] {
  if (Object.is(before, after)) {
    return [];
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const changes: PropertyChange[] = [];
    const shared = Math.min(before.length, after.length);
    for (let index = 0; index < shared; index += 1) {
      changes.push(...deepDiff(before[index], after[index], joinPath(path, `[${index}]`)));
    }
    for (let index = shared; index < before.length; index += 1) {
      changes.push({ path: joinPath(path, `[${index}]`), before: before[index], after: undefined });
    }
    for (let index = shared; index < after.length; index += 1) {
      changes.push({ path: joinPath(path, `[${index}]`), before: undefined, after: after[index] });
    }
    return changes;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const changes: PropertyChange[] = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      if (!(key in before)) {
        changes.push({ path: joinPath(path, key), before: undefined, after: after[key] });
        continue;
      }
      if (!(key in after)) {
        changes.push({ path: joinPath(path, key), before: before[key], after: undefined });
        continue;
      }
      changes.push(...deepDiff(before[key], after[key], joinPath(path, key)));
    }
    return changes;
  }

  return [{ path, before, after }];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function joinPath(base: string, segment: string): string {
  if (!base) {
    return segment;
  }
  return segment.startsWith("[") ? `${base}${segment}` : `${base}.${segment}`;
}
