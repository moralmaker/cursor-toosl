import { Hono } from "hono";
import { listDismissals, summarizeDismissals } from "../db/dismissals.ts";
import { isUuid } from "../domain/slot.ts";
import type { AppEnv } from "../http.ts";
import { dbFrom, json } from "../http.ts";

export const dismissalRoutes = new Hono<AppEnv>();

dismissalRoutes.get("/", async (c) => {
  const adId = c.req.query("adId") ?? "";
  if (adId && !isUuid(adId)) {
    return json(c, { error: "invalid ad id" }, 400);
  }
  const [items, summary] = await Promise.all([
    listDismissals(dbFrom(c), adId || undefined),
    summarizeDismissals(dbFrom(c)),
  ]);
  return json(c, { items, summary });
});
