export const BASE_PLATFORMS = [
  "darwin-aarch64",
  "darwin-x86_64",
  "linux-x86_64",
  "windows-x86_64",
] as const;

export const INSTALLER_SUFFIXES = ["nsis", "msi", "app", "deb", "rpm", "appimage"] as const;

export const ASSET_KINDS = ["installer", "portable"] as const;

export type BasePlatform = (typeof BASE_PLATFORMS)[number];
export type AssetKind = (typeof ASSET_KINDS)[number];

const PLATFORM_RE = new RegExp(
  `^(${BASE_PLATFORMS.join("|")})(-(${INSTALLER_SUFFIXES.join("|")}))?$`,
);

export function isAllowedPlatform(value: string): boolean {
  return PLATFORM_RE.test(value);
}

export function portablePlatforms(): readonly string[] {
  return ["windows-x86_64"];
}
