import { describe, expect, it } from "vitest";
import {
  classifyAssetName,
  parseDayRange,
  shouldCountDownload,
  utcDay,
} from "./download-stats.ts";

describe("shouldCountDownload", () => {
  it("skips signatures and manifests", () => {
    expect(shouldCountDownload("Cursor.Tools_1.0.1_x64-setup.exe")).toBe(true);
    expect(shouldCountDownload("Cursor.Tools_1.0.1_x64-setup.exe.sig")).toBe(false);
    expect(shouldCountDownload("latest.json")).toBe(false);
  });
});

describe("escape-sensitive asset names", () => {
  it("keeps underscores in version/platform classification", () => {
    expect(classifyAssetName("Cursor.Tools_1.0.1_amd64.deb").version).toBe("1.0.1");
  });
});

describe("classifyAssetName", () => {
  it("classifies current release filenames", () => {
    expect(classifyAssetName("Cursor.Tools_1.0.1_aarch64.app.tar.gz")).toEqual({
      version: "1.0.1",
      platform: "darwin-aarch64-app",
      channel: "installer",
    });
    expect(classifyAssetName("Cursor.Tools_1.0.1_x64.app.tar.gz")).toEqual({
      version: "1.0.1",
      platform: "darwin-x86_64-app",
      channel: "installer",
    });
    expect(classifyAssetName("Cursor.Tools_1.0.1_x64-setup.exe")).toEqual({
      version: "1.0.1",
      platform: "windows-x86_64-nsis",
      channel: "installer",
    });
    expect(classifyAssetName("cursor-tools-1.0.1-windows-amd64.zip")).toEqual({
      version: "1.0.1",
      platform: "windows-x86_64",
      channel: "portable",
    });
    expect(classifyAssetName("Cursor.Tools_1.0.1_amd64.deb")).toEqual({
      version: "1.0.1",
      platform: "linux-x86_64-deb",
      channel: "installer",
    });
  });
});

describe("parseDayRange", () => {
  it("defaults to a 30-day window ending today", () => {
    const today = utcDay();
    const range = parseDayRange(undefined, undefined, today);
    expect("error" in range).toBe(false);
    if ("error" in range) {
      return;
    }
    expect(range.to).toBe(today);
    expect(range.from <= range.to).toBe(true);
  });

  it("rejects inverted ranges", () => {
    expect(parseDayRange("2026-10-10", "2026-10-01")).toEqual({ error: "from must be <= to" });
  });
});
