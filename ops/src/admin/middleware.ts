import { createMiddleware } from "hono/factory";
import { getSession } from "../db/sessions.ts";
import type { AdminSession } from "../env.ts";
import { type AppEnv, dbFrom, json } from "../http.ts";
import { sha256Hex } from "../security/crypto.ts";

export const SESSION_COOKIE = "ops_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const ADMIN_BODY_MAX = 100 * 1024;

export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  const match = cookieHeader.match(/(?:^|;\s*)ops_session=([0-9a-f]{64})/i);
  return match?.[1] ?? null;
}

export function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export const requireSession = createMiddleware<AppEnv & { Variables: { session: AdminSession } }>(
  async (c, next) => {
    const token = readSessionToken(c.req.header("Cookie"));
    if (!token) {
      return json(c, { error: "unauthorized" }, 401);
    }
    const hash = await sha256Hex(token);
    const row = await getSession(dbFrom(c), hash);
    if (!row || Date.parse(row.expires_at) < Date.now()) {
      return json(c, { error: "unauthorized" }, 401);
    }
    c.set("session", { id: row.id, expiresAt: row.expires_at, ip: row.ip });
    await next();
  },
);

export const requireMutatingGuards = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    await next();
    return;
  }

  const origin = c.req.header("Origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(c.req.url).origin) {
        return json(c, { error: "cross-origin request rejected" }, 403);
      }
    } catch {
      return json(c, { error: "cross-origin request rejected" }, 403);
    }
  }

  const site = c.req.header("Sec-Fetch-Site");
  if (site && site !== "same-origin" && site !== "none") {
    return json(c, { error: "cross-origin request rejected" }, 403);
  }

  if (c.req.header("X-Requested-With") !== "XMLHttpRequest") {
    return json(c, { error: "invalid request" }, 403);
  }

  await next();
});
