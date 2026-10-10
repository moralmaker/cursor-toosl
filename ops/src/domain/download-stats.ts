import { isSemver } from "./semver.ts";

export type DownloadChannel = "installer" | "portable" | "other";

export type ClassifiedAsset = {
  version: string;
  platform: string;
  channel: DownloadChannel;
};

/** 只抓核心版本，或常见预发布后缀（避免把 -windows-amd64 当成 pre）。 */
const SEMVER_IN_NAME = /(\d+\.\d+\.\d+)(?:-((?:alpha|beta|rc|pre|canary)(?:\.[0-9A-Za-z.-]+)?))?/i;

/** 签名与清单文件不计为下载。 */
export function shouldCountDownload(assetName: string): boolean {
  const lower = assetName.toLowerCase();
  if (lower.endsWith(".sig")) {
    return false;
  }
  if (lower === "latest.json" || lower === "portable-latest.json" || lower === "update.json") {
    return false;
  }
  return true;
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function parseDayRange(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  today = utcDay(),
): { from: string; to: string } | { error: string } {
  const to = toRaw?.trim() || today;
  const from = fromRaw?.trim() || shiftUtcDay(to, -29);
  if (!isDay(from) || !isDay(to)) {
    return { error: "from/to must be YYYY-MM-DD" };
  }
  if (from > to) {
    return { error: "from must be <= to" };
  }
  if (daySpan(from, to) > 366) {
    return { error: "range must be at most 366 days" };
  }
  return { from, to };
}

export function classifyAssetName(assetName: string): ClassifiedAsset {
  const version = extractVersion(assetName) ?? "unknown";
  const lower = assetName.toLowerCase();

  if (lower.includes("windows-amd64.zip") || /portable/i.test(assetName)) {
    return { version, platform: "windows-x86_64", channel: "portable" };
  }
  if (lower.endsWith("x64-setup.exe") || lower.endsWith("_x64-setup.exe")) {
    return { version, platform: "windows-x86_64-nsis", channel: "installer" };
  }
  if (lower.includes("aarch64.app.tar.gz")) {
    return { version, platform: "darwin-aarch64-app", channel: "installer" };
  }
  if (lower.includes("x64.app.tar.gz")) {
    return { version, platform: "darwin-x86_64-app", channel: "installer" };
  }
  if (lower.includes("macos-arm64")) {
    return { version, platform: "darwin-aarch64", channel: "installer" };
  }
  if (lower.includes("macos-amd64")) {
    return { version, platform: "darwin-x86_64", channel: "installer" };
  }
  if (lower.endsWith(".appimage")) {
    return { version, platform: "linux-x86_64-appimage", channel: "installer" };
  }
  if (lower.endsWith(".deb")) {
    return { version, platform: "linux-x86_64-deb", channel: "installer" };
  }
  if (lower.endsWith(".rpm")) {
    return { version, platform: "linux-x86_64-rpm", channel: "installer" };
  }
  if (lower.includes("linux-amd64")) {
    return { version, platform: "linux-x86_64", channel: "installer" };
  }
  if (lower.includes("windows-amd64") || lower.endsWith(".exe")) {
    return { version, platform: "windows-x86_64", channel: "installer" };
  }

  return { version, platform: "unknown", channel: "other" };
}

function extractVersion(assetName: string): string | null {
  const match = assetName.match(SEMVER_IN_NAME);
  if (!match?.[1]) {
    return null;
  }
  const version = match[2] ? `${match[1]}-${match[2]}` : match[1];
  return isSemver(version) ? version : null;
}

function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

function shiftUtcDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return utcDay(date);
}

function daySpan(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}
