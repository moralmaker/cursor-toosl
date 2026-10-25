import { describe, expect, it } from "vitest";
import { buildTauriManifest, manifestFromGithubJson, opsAssetUrl, parseReleaseInput, pickLatestPublished } from "./release.ts";
import { compareSemver, isSemver } from "./semver.ts";

describe("semver", () => {
  it("compares core and pre-release versions", () => {
    expect(isSemver("0.1.7")).toBe(true);
    expect(isSemver("1.0")).toBe(false);
    expect(compareSemver("0.1.8", "0.1.7")).toBe(1);
    expect(compareSemver("1.0.0-beta", "1.0.0")).toBe(-1);
  });
});

describe("release manifests", () => {
  const release = {
    version: "0.1.7",
    notes: "Cursor TOOLS v0.1.7",
    pubDate: "2026-01-01T00:00:00.000Z",
    published: true,
    changelogTitle: "",
    changelogBody: "",
    changelogVisible: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    assets: [
      {
        id: 1,
        kind: "installer" as const,
        platform: "darwin-aarch64",
        url: "https://github.com/moralmaker/cursor-toosl/releases/download/v0.1.7/app.tar.gz",
        signature: "untrusted comment: minisign\nRWQ...",
      },
      {
        id: 2,
        kind: "portable" as const,
        platform: "windows-x86_64",
        url: "https://github.com/moralmaker/cursor-toosl/releases/download/v0.1.7/cursor-tools-desktop.exe",
        signature: "sig",
      },
    ],
  };

  it("builds installer and portable Tauri manifests", () => {
    expect(buildTauriManifest(release, "installer")).toEqual({
      version: "0.1.7",
      notes: "Cursor TOOLS v0.1.7",
      pub_date: "2026-01-01T00:00:00.000Z",
      platforms: {
        "darwin-aarch64": {
          url: release.assets[0].url,
          signature: release.assets[0].signature,
        },
      },
    });
    expect(buildTauriManifest(release, "portable")?.platforms).toEqual({
      "windows-x86_64": {
        url: release.assets[1].url,
        signature: "sig",
      },
    });
  });

  it("picks the highest published semver", () => {
    const older = { ...release, version: "0.1.6", assets: [] };
    expect(pickLatestPublished([older, release])?.version).toBe("0.1.7");
    expect(pickLatestPublished([{ ...release, published: false }])).toBeNull();
  });

  it("rewrites GitHub asset URLs onto the ops accelerator", () => {
    expect(
      opsAssetUrl(
        "https://ops.susuan.ai",
        "https://github.com/moralmaker/cursor-toosl/releases/download/v1.1.0/Cursor.Tools_1.1.0_amd64.deb",
      ),
    ).toBe("https://ops.susuan.ai/api/v1/updates/assets/Cursor.Tools_1.1.0_amd64.deb");
    expect(opsAssetUrl("https://ops.susuan.ai", "https://ops.susuan.ai/api/v1/updates/assets/already.deb")).toBe(
      "https://ops.susuan.ai/api/v1/updates/assets/already.deb",
    );
  });

  it("imports GitHub latest.json", () => {
    const imported = manifestFromGithubJson(
      {
        version: "v0.1.7",
        notes: "notes",
        pub_date: "2026-01-01T00:00:00.000Z",
        platforms: {
          "windows-x86_64-nsis": {
            url: "https://github.com/moralmaker/cursor-toosl/releases/download/v0.1.7/setup.exe",
            signature: "sig",
          },
        },
      },
      "installer",
    );
    expect(imported).toMatchObject({
      value: {
        version: "0.1.7",
        published: true,
        assets: [{ kind: "installer", platform: "windows-x86_64-nsis" }],
      },
    });
  });

  it("rejects unknown platforms", () => {
    expect(
      parseReleaseInput({
        version: "0.1.7",
        assets: [
          {
            kind: "installer",
            platform: "solaris-sparc",
            url: "https://example.com/a",
            signature: "sig",
          },
        ],
      }),
    ).toHaveProperty("errors");
  });
});
