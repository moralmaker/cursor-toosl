import { Hono } from "hono";
import { queryDownloadStats } from "../db/download-stats.ts";
import { parseDayRange } from "../domain/download-stats.ts";
import type { AppEnv } from "../http.ts";
import { dbFrom, json } from "../http.ts";

export const downloadStatsRoutes = new Hono<AppEnv>();

downloadStatsRoutes.get("/", async (c) => {
  const range = parseDayRange(c.req.query("from") ?? undefined, c.req.query("to") ?? undefined);
  if ("error" in range) {
    return json(c, { error: range.error }, 400);
  }
  const summary = await queryDownloadStats(dbFrom(c), range.from, range.to);
  return json(c, { from: range.from, to: range.to, ...summary });
});
