import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AdminSession, Bindings } from "./env.ts";
import { createD1 } from "./db/d1.ts";
import type { Db } from "./db/database.ts";

export type AppEnv = {
  Bindings: Bindings;
  Variables: { session: AdminSession };
};

export function dbFrom(c: Context<AppEnv>): Db {
  return createD1(c.env.DB);
}

export function json(
  c: Context<AppEnv>,
  body: unknown,
  status: ContentfulStatusCode = 200,
  extra?: Record<string, string>,
): Response {
  return c.json(body, status, {
    "Cache-Control": "no-store",
    ...extra,
  });
}

export function clientIp(c: Context<AppEnv>): string {
  return c.req.header("CF-Connecting-IP") ?? "unknown";
}

export async function readJson(
  c: Context<AppEnv>,
  maxBytes: number,
): Promise<{ value: unknown } | { error: string; status: ContentfulStatusCode }> {
  const contentType = c.req.header("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { error: "Content-Type must be application/json", status: 415 };
  }
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (Number.isFinite(length) && length > maxBytes) {
    return { error: "request body too large", status: 413 };
  }
  const bytes = await c.req.raw.arrayBuffer();
  if (bytes.byteLength > maxBytes) {
    return { error: "request body too large", status: 413 };
  }
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { error: "request body is not valid JSON", status: 400 };
  }
}

export const DEVICE_ID_HEADER = "X-Cursor-Assistant-Device-ID";
export const OS_HEADER = "X-Cursor-Assistant-OS";
export const APP_VERSION_HEADER = "X-Cursor-Assistant-Version";
export const DISABLED_AD_IDS_HEADER = "disable-ad-ids";
export const LANGUAGE_HEADER = "accept-language";

export type DeviceContext = {
  deviceId: string;
  os: string;
  version: string;
};

export type ClientContext = DeviceContext & {
  language: string;
};

export function parseDeviceHeaders(input: {
  deviceId?: string | null;
  os?: string | null;
  version?: string | null;
}): DeviceContext | string {
  const deviceId = input.deviceId ?? "";
  const os = input.os ?? "";
  const version = input.version ?? "";
  if (!deviceId || !os || !version) {
    return "missing required client headers";
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      deviceId,
    )
  ) {
    return "invalid device id";
  }
  if (!/^(macos|linux|windows)$/.test(os)) {
    return "invalid os";
  }
  if (!/^[0-9A-Za-z.+-]{1,32}$/.test(version)) {
    return "invalid app version";
  }
  return { deviceId, os, version };
}

export function readDeviceContext(c: Context<AppEnv>): DeviceContext | string {
  return parseDeviceHeaders({
    deviceId: c.req.header(DEVICE_ID_HEADER),
    os: c.req.header(OS_HEADER),
    version: c.req.header(APP_VERSION_HEADER),
  });
}

export function readClientContext(c: Context<AppEnv>): ClientContext | string {
  const device = readDeviceContext(c);
  if (typeof device === "string") {
    return device;
  }
  const language = c.req.header(LANGUAGE_HEADER) ?? "";
  if (!language) {
    return "missing required client headers";
  }
  return { ...device, language };
}
