import { describe, expect, it } from "vitest";
import { nextFailureState, isLocked, IP_MAX_ATTEMPTS, ACCOUNT_MAX_ATTEMPTS } from "../domain/lock.ts";
import {
  generateTotp,
  hmacSha256Hex,
  parsePasswordHash,
  pbkdf2Hex,
  timingSafeEqualStr,
  verifyPassword,
  verifyTotp,
} from "./crypto.ts";

describe("crypto", () => {
  it("computes a stable HMAC", async () => {
    const hex = await hmacSha256Hex("secret", '{"slots":[]}');
    expect(hex).toHaveLength(64);
    expect(hex).toBe(await hmacSha256Hex("secret", '{"slots":[]}'));
    expect(hex).not.toBe(await hmacSha256Hex("other", '{"slots":[]}'));
  });

  it("verifies a self-describing PBKDF2 hash", async () => {
    const salt = new Uint8Array(16).fill(7);
    const derived = await pbkdf2Hex("changeme", salt, 1000);
    const encoded = `pbkdf2-sha256$1000$${[...salt].map((b) => b.toString(16).padStart(2, "0")).join("")}$${derived}`;
    expect(parsePasswordHash(encoded)?.iterations).toBe(1000);
    expect(await verifyPassword("changeme", encoded)).toBe(true);
    expect(await verifyPassword("wrong", encoded)).toBe(false);
  });

  it("accepts TOTP codes in a ±1 window", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const now = Date.parse("2026-09-09T12:00:00.000Z");
    const code = await generateTotp(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(await verifyTotp(secret, code, now)).toBe(true);
    expect(await verifyTotp(secret, code, now + 30_000)).toBe(true);
    expect(await verifyTotp(secret, "000000", now)).toBe(false);
  });

  it("compares strings in constant-length fashion", async () => {
    expect(await timingSafeEqualStr("abc", "abc")).toBe(true);
    expect(await timingSafeEqualStr("abc", "abd")).toBe(false);
  });
});

describe("login lock", () => {
  const now = Date.parse("2026-09-09T12:00:00.000Z");

  it("locks an IP after five failures", () => {
    let row = null;
    for (let i = 0; i < IP_MAX_ATTEMPTS; i += 1) {
      row = nextFailureState("ip", row, "ip:1.1.1.1", now + i);
    }
    expect(isLocked(row, now + 10).blocked).toBe(true);
  });

  it("locks an account after twenty failures in an hour", () => {
    let row = null;
    for (let i = 0; i < ACCOUNT_MAX_ATTEMPTS; i += 1) {
      row = nextFailureState("account", row, "account:admin", now + i * 1000);
    }
    const decision = isLocked(row, now + 21_000);
    expect(decision.blocked).toBe(true);
  });
});
