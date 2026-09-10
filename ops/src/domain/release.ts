import { z } from "zod";
import { isAbsoluteHttpUrl } from "./http.ts";
import { ASSET_KINDS, isAllowedPlatform } from "./platforms.ts";
import { compareSemver, isSemver } from "./semver.ts";

const httpUrl = z
  .string()
  .min(1)
  .max(2000)
  .refine(isAbsoluteHttpUrl, "must be an absolute http(s) URL with a host");

export const releaseAssetSchema = z.object({
  kind: z.enum(ASSET_KINDS),
  platform: z.string().refine(isAllowedPlatform, "unsupported platform key"),
  url: httpUrl,
  signature: z.string().trim().min(1).max(8000),
});

export const releaseInputSchema = z.object({
  version: z.string().trim().refine(isSemver, "version must be semver x.y.z"),
  notes: z.string().max(8000).default(""),
  pubDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined)),
  published: z.boolean().default(false),
  assets: z.array(releaseAssetSchema).max(40).default([]),
});

export type ReleaseAssetInput = z.infer<typeof releaseAssetSchema>;
export type ReleaseInput = z.infer<typeof releaseInputSchema>;

export type StoredReleaseAsset = ReleaseAssetInput & {
  id: number;
};

export type StoredRelease = {
  version: string;
  notes: string;
  pubDate: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  assets: StoredReleaseAsset[];
};

export type TauriPlatformEntry = {
  signature: string;
  url: string;
};

export type TauriManifest = {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, TauriPlatformEntry>;
};

export function parseReleaseInput(input: unknown): { value: ReleaseInput } | { errors: string[] } {
  const result = releaseInputSchema.safeParse(input);
  if (!result.success) {
    return { errors: result.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`) };
  }
  const seen = new Set<string>();
  for (const asset of result.data.assets) {
    const key = `${asset.kind}:${asset.platform}`;
    if (seen.has(key)) {
      return { errors: [`duplicate asset ${key}`] };
    }
    seen.add(key);
  }
  return { value: result.data };
}

export function buildTauriManifest(
  release: StoredRelease,
  kind: "installer" | "portable",
): TauriManifest | null {
  const platforms: Record<string, TauriPlatformEntry> = {};
  for (const asset of release.assets) {
    if (asset.kind !== kind) {
      continue;
    }
    platforms[asset.platform] = {
      signature: asset.signature,
      url: asset.url,
    };
  }
  if (Object.keys(platforms).length === 0) {
    return null;
  }
  return {
    version: release.version,
    notes: release.notes,
    pub_date: release.pubDate,
    platforms,
  };
}

export function pickLatestPublished(releases: StoredRelease[]): StoredRelease | null {
  const published = releases.filter((release) => release.published);
  if (published.length === 0) {
    return null;
  }
  return published.reduce((latest, current) =>
    compareSemver(current.version, latest.version) > 0 ? current : latest,
  );
}

export const githubRepoSchema = z.object({
  repository: z
    .string()
    .trim()
    .regex(/^[^/\s]+\/[^/\s]+$/, "repository must be owner/name"),
});

export type GithubImportInput = z.infer<typeof githubRepoSchema>;

export function parseGithubImport(input: unknown): { value: GithubImportInput } | { errors: string[] } {
  const result = githubRepoSchema.safeParse(input);
  if (!result.success) {
    return { errors: result.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`) };
  }
  return { value: result.data };
}

export function manifestFromGithubJson(
  payload: unknown,
  kind: "installer" | "portable",
): { value: ReleaseInput } | { errors: string[] } {
  if (!payload || typeof payload !== "object") {
    return { errors: ["manifest must be a JSON object"] };
  }
  const record = payload as Record<string, unknown>;
  const version = typeof record.version === "string" ? record.version.replace(/^v/, "") : "";
  const notes = typeof record.notes === "string" ? record.notes : "";
  const pubDate = typeof record.pub_date === "string" ? record.pub_date : undefined;
  const platforms = record.platforms;
  if (!platforms || typeof platforms !== "object") {
    return { errors: ["manifest.platforms is required"] };
  }
  const assets: ReleaseAssetInput[] = [];
  for (const [platform, entry] of Object.entries(platforms as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") {
      return { errors: [`platform ${platform} is invalid`] };
    }
    const row = entry as Record<string, unknown>;
    assets.push({
      kind,
      platform,
      url: typeof row.url === "string" ? row.url : "",
      signature: typeof row.signature === "string" ? row.signature : "",
    });
  }
  return parseReleaseInput({
    version,
    notes,
    pubDate,
    published: true,
    assets,
  });
}
