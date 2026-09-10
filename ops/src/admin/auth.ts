import { Hono } from "hono";
import { z } from "zod";
import { writeAudit } from "../db/audit.ts";
import {
  clearAttempts,
  createSession,
  deleteExpiredSessions,
  deleteSession,
  getAttempt,
  putAttempt,
} from "../db/sessions.ts";
import { isLocked, nextFailureState } from "../domain/lock.ts";
import type { AppEnv } from "../http.ts";
import { clientIp, dbFrom, json, readJson } from "../http.ts";
import { sha256Hex, timingSafeEqualStr, verifyPassword, verifyTotp } from "../security/crypto.ts";
import { SESSION_TTL_SECONDS, sessionCookie } from "./middleware.ts";

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
  totp: z.string().regex(/^\d{6}$/).optional(),
});

export const loginRoute = new Hono<AppEnv>();

loginRoute.post("/login", async (c) => {
  const ip = clientIp(c);
  const db = dbFrom(c);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const ipKey = `ip:${ip}`;
  const usernameHint = String(c.env.ADMIN_USERNAME || "admin");
  const accountKey = `account:${usernameHint}`;

  const ipLock = isLocked(await getAttempt(db, ipKey), nowMs);
  const accountLock = isLocked(await getAttempt(db, accountKey), nowMs);
  if (ipLock.blocked || accountLock.blocked) {
    return json(c, { error: "too many attempts, try again later" }, 429);
  }

  const parsed = await readJson(c, 4 * 1024);
  if ("error" in parsed) {
    return json(c, { error: parsed.error }, parsed.status);
  }
  const body = loginSchema.safeParse(parsed.value);
  if (!body.success) {
    return json(c, { error: "invalid credentials" }, 400);
  }

  const usernameOk = await timingSafeEqualStr(body.data.username, usernameHint);
  const passwordOk = await verifyPassword(body.data.password, c.env.ADMIN_PASSWORD_HASH || "");
  const totpSecret = c.env.ADMIN_TOTP_SECRET?.trim();
  const totpOk = totpSecret
    ? await verifyTotp(totpSecret, body.data.totp ?? "")
    : body.data.totp === undefined;

  if (!usernameOk || !passwordOk || !totpOk) {
    await putAttempt(db, nextFailureState("ip", await getAttempt(db, ipKey), ipKey, nowMs));
    await putAttempt(db, nextFailureState("account", await getAttempt(db, accountKey), accountKey, nowMs));
    await writeAudit(db, { action: "auth.login.fail", actor: body.data.username, ip });
    return json(c, { error: "invalid credentials" }, 401);
  }

  await clearAttempts(db, ipKey);
  await clearAttempts(db, accountKey);
  await deleteExpiredSessions(db, nowIso);

  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(nowMs + SESSION_TTL_SECONDS * 1000).toISOString();
  await createSession(db, tokenHash, nowIso, expiresAt, ip);
  await writeAudit(db, { action: "auth.login.success", actor: usernameHint, ip });

  return c.json(
    { ok: true },
    200,
    {
      "Cache-Control": "no-store",
      "Set-Cookie": sessionCookie(token, SESSION_TTL_SECONDS, new URL(c.req.url).protocol === "https:"),
    },
  );
});

export const sessionRoutes = new Hono<AppEnv & { Variables: { session: { id: string } } }>();

sessionRoutes.get("/me", (c) =>
  json(c, {
    username: String(c.env.ADMIN_USERNAME || "admin"),
    totpRequired: Boolean(c.env.ADMIN_TOTP_SECRET?.trim()),
  }),
);

sessionRoutes.post("/logout", async (c) => {
  await deleteSession(dbFrom(c), c.get("session").id);
  return c.json(
    { ok: true },
    200,
    {
      "Cache-Control": "no-store",
      "Set-Cookie": sessionCookie("", 0, new URL(c.req.url).protocol === "https:"),
    },
  );
});
