import { describe, expect, it } from "vitest";
import { parseDeviceHeaders } from "./http.ts";

describe("parseDeviceHeaders", () => {
  const valid = {
    deviceId: "11111111-1111-4111-8111-111111111111",
    os: "macos",
    version: "0.1.0",
  };

  it("accepts the desktop advertisement headers without a language", () => {
    expect(parseDeviceHeaders(valid)).toEqual(valid);
  });

  it("rejects a missing device, os, or version header", () => {
    expect(parseDeviceHeaders({ ...valid, language: undefined, deviceId: "" })).toBe(
      "missing required client headers",
    );
  });

  it("rejects an invalid installation id", () => {
    expect(parseDeviceHeaders({ ...valid, deviceId: "not-a-uuid" })).toBe(
      "invalid device id",
    );
  });
});
