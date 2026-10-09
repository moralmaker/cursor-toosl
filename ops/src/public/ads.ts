import { Hono } from "hono";
import { z } from "zod";
import { upsertDismissal } from "../db/dismissals.ts";
import { listSlots } from "../db/slots.ts";
import { writeAudit } from "../db/audit.ts";
import {
  clientLocale,
  isUuid,
  slotDismissedByClient,
  slotMatchesLocale,
  slotSupportedByClient,
  slotVisibleNow,
  toPublicSlot,
} from "../domain/slot.ts";
import {
  DISABLED_AD_IDS_HEADER,
  type AppEnv,
  dbFrom,
  json,
  readClientContext,
  readDeviceContext,
  readJson,
} from "../http.ts";
import { hmacSha256Hex } from "../security/crypto.ts";

const dismissalSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const adsRoutes = new Hono<AppEnv>();

adsRoutes.get("/api/v1/ads", async (c) => {
  const placement = c.req.query("placement") ?? "";
  if (placement !== "menu") {
    return json(c, { error: "placement must be menu" }, 400);
  }
  const client = readClientContext(c);
  if (typeof client === "string") {
    return json(c, { error: client }, 400);
  }

  const locale = clientLocale(client.language);
  const now = new Date().toISOString();
  const disabled = new Set(
    (c.req.header(DISABLED_AD_IDS_HEADER) ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );

  const slots = (await listSlots(dbFrom(c)))
    .filter((slot) => slotVisibleNow(slot, now))
    .filter((slot) => slotMatchesLocale(slot, locale))
    .filter((slot) => !slotDismissedByClient(slot, disabled))
    .filter((slot) => slotSupportedByClient(slot, client.version))
    .map(toPublicSlot);

  const body = JSON.stringify({ slots });
  const signature = await hmacSha256Hex(c.env.SIGNING_SECRET || "", body);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Signature": `sha256=${signature}`,
    },
  });
});

adsRoutes.post("/api/v1/ads/:adId/dismissals", async (c) => {
  const client = readDeviceContext(c);
  if (typeof client === "string") {
    return json(c, { error: client }, 400);
  }
  const adId = c.req.param("adId");
  if (!isUuid(adId)) {
    return json(c, { error: "invalid ad id" }, 400);
  }
  const parsed = await readJson(c, 4 * 1024);
  if ("error" in parsed) {
    return json(c, { error: parsed.error }, parsed.status);
  }
  const body = dismissalSchema.safeParse(parsed.value);
  if (!body.success) {
    return json(c, { error: "reason is required" }, 400);
  }

  const now = new Date().toISOString();
  await upsertDismissal(dbFrom(c), {
    adId,
    deviceId: client.deviceId,
    reason: body.data.reason,
    os: client.os,
    appVersion: client.version,
    now,
  });
  await writeAudit(dbFrom(c), {
    action: "ad.dismiss",
    actor: "device",
    detail: adId,
    ip: client.deviceId,
  });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
