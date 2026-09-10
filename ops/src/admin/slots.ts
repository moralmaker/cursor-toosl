import { Hono } from "hono";
import { z } from "zod";
import { writeAudit } from "../db/audit.ts";
import { deleteSlot, insertSlot, listSlots, reorderSlots, updateSlot } from "../db/slots.ts";
import { isUuid, parseSlotInput } from "../domain/slot.ts";
import type { AppEnv } from "../http.ts";
import { clientIp, dbFrom, json, readJson } from "../http.ts";
import { ADMIN_BODY_MAX } from "./middleware.ts";

const orderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

export const slotRoutes = new Hono<AppEnv>();

slotRoutes.get("/", async (c) => json(c, { slots: await listSlots(dbFrom(c)) }));

slotRoutes.post("/", async (c) => {
  const parsed = await readJson(c, ADMIN_BODY_MAX);
  if ("error" in parsed) {
    return json(c, { error: parsed.error }, parsed.status);
  }
  const input = parseSlotInput(parsed.value);
  if ("errors" in input) {
    return json(c, { error: input.errors.join("; ") }, 400);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await insertSlot(dbFrom(c), id, input.value, now);
  await writeAudit(dbFrom(c), {
    action: "slot.create",
    actor: "admin",
    detail: input.value.target.title,
    ip: clientIp(c),
  });
  return json(c, { id });
});

slotRoutes.put("/order", async (c) => {
  const parsed = await readJson(c, ADMIN_BODY_MAX);
  if ("error" in parsed) {
    return json(c, { error: parsed.error }, parsed.status);
  }
  const body = orderSchema.safeParse(parsed.value);
  if (!body.success) {
    return json(c, { error: "ids must be a UUID array" }, 400);
  }
  await reorderSlots(dbFrom(c), body.data.ids, new Date().toISOString());
  await writeAudit(dbFrom(c), { action: "slot.reorder", actor: "admin", ip: clientIp(c) });
  return json(c, { ok: true });
});

slotRoutes.put("/:id", async (c) => {
  const id = c.req.param("id");
  if (!isUuid(id)) {
    return json(c, { error: "invalid id" }, 400);
  }
  const parsed = await readJson(c, ADMIN_BODY_MAX);
  if ("error" in parsed) {
    return json(c, { error: parsed.error }, parsed.status);
  }
  const input = parseSlotInput(parsed.value);
  if ("errors" in input) {
    return json(c, { error: input.errors.join("; ") }, 400);
  }
  const updated = await updateSlot(dbFrom(c), id, input.value, new Date().toISOString());
  if (!updated) {
    return json(c, { error: "not found" }, 404);
  }
  await writeAudit(dbFrom(c), { action: "slot.update", actor: "admin", detail: id, ip: clientIp(c) });
  return json(c, { ok: true });
});

slotRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (!isUuid(id)) {
    return json(c, { error: "invalid id" }, 400);
  }
  const deleted = await deleteSlot(dbFrom(c), id);
  if (!deleted) {
    return json(c, { error: "not found" }, 404);
  }
  await writeAudit(dbFrom(c), { action: "slot.delete", actor: "admin", detail: id, ip: clientIp(c) });
  return json(c, { ok: true });
});
