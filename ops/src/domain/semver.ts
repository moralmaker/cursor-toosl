const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function isSemver(value: string): boolean {
  return SEMVER_RE.test(value);
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let i = 0; i < 3; i += 1) {
    if (a.core[i] !== b.core[i]) {
      return a.core[i] > b.core[i] ? 1 : -1;
    }
  }
  if (a.pre === b.pre) {
    return 0;
  }
  if (!a.pre) {
    return 1;
  }
  if (!b.pre) {
    return -1;
  }
  return a.pre < b.pre ? -1 : a.pre > b.pre ? 1 : 0;
}

function parseSemver(value: string): { core: [number, number, number]; pre: string } {
  const [core, pre = ""] = String(value).replace(/^v/, "").split("-", 2);
  const parts = core.split(".").map((part) => Number.parseInt(part, 10) || 0);
  return {
    core: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0],
    pre,
  };
}
