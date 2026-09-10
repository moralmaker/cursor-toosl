const encoder = new TextEncoder();

export const PASSWORD_HASH_PREFIX = "pbkdf2-sha256";
export const DEFAULT_PBKDF2_ITERATIONS = 10_000;

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new Error("invalid hex");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToHex(new Uint8Array(signature));
}

export function randomToken(bytes = 32): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return bytesToHex(values);
}

export async function timingSafeEqualStr(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(left), sha256Hex(right)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export type ParsedPasswordHash = {
  iterations: number;
  salt: Uint8Array;
  hashHex: string;
};

export function parsePasswordHash(encoded: string): ParsedPasswordHash | null {
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== PASSWORD_HASH_PREFIX) {
    return null;
  }
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 100_000) {
    return null;
  }
  try {
    return {
      iterations,
      salt: hexToBytes(parts[2]),
      hashHex: parts[3].toLowerCase(),
    };
  } catch {
    return null;
  }
}

export async function pbkdf2Hex(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) {
    return false;
  }
  const derived = await pbkdf2Hex(password, parsed.salt, parsed.iterations);
  return timingSafeEqualStr(derived, parsed.hashHex);
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function decodeBase32(secret: string): Uint8Array {
  const normalized = secret.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw new Error("invalid base32");
  }
  let bits = "";
  for (const char of normalized) {
    bits += BASE32_ALPHABET.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

export async function generateTotp(
  secret: string,
  nowMs = Date.now(),
  stepSeconds = 30,
): Promise<string> {
  const keyBytes = decodeBase32(secret);
  const counter = Math.floor(nowMs / 1000 / stepSeconds);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(4, counter);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export async function verifyTotp(secret: string, code: string, nowMs = Date.now()): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }
  for (const offset of [-1, 0, 1]) {
    const candidate = await generateTotp(secret, nowMs + offset * 30_000);
    if (await timingSafeEqualStr(candidate, code)) {
      return true;
    }
  }
  return false;
}
