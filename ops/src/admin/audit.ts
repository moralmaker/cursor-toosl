import { Hono } from "hono";
import { listAudit } from "../db/audit.ts";
import type { AppEnv } from "../http.ts";
import { dbFrom, json } from "../http.ts";

export const auditRoutes = new Hono<AppEnv>();

auditRoutes.get("/", async (c) => {
  const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
  return json(c, { items: await listAudit(dbFrom(c), Number.isFinite(limit) ? limit : 100) });
});
