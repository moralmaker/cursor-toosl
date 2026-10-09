import { Hono } from "hono";
import { writeAudit } from "../db/audit.ts";
import { IMAGE_MAX_BYTES, imageObjectName, sniffImage } from "../domain/image.ts";
import type { AppEnv } from "../http.ts";
import { clientIp, dbFrom, json } from "../http.ts";
import { sha256Hex } from "../security/crypto.ts";

export const imageRoutes = new Hono<AppEnv>();

imageRoutes.post("/", async (c) => {
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (Number.isFinite(length) && length > IMAGE_MAX_BYTES) {
    return json(c, { error: "image exceeds 10 MiB" }, 413);
  }
  const bytes = new Uint8Array(await c.req.raw.arrayBuffer());
  if (bytes.byteLength === 0) {
    return json(c, { error: "empty image" }, 400);
  }
  if (bytes.byteLength > IMAGE_MAX_BYTES) {
    return json(c, { error: "image exceeds 10 MiB" }, 413);
  }
  const format = sniffImage(bytes);
  if (!format) {
    return json(c, { error: "only png, jpg, gif, webp and avif images are supported" }, 415);
  }
  const name = imageObjectName(await sha256Hex(bytes), format);
  await c.env.IMAGES.put(name, bytes, { httpMetadata: { contentType: format.contentType } });
  await writeAudit(dbFrom(c), { action: "image.upload", actor: "admin", detail: name, ip: clientIp(c) });
  return json(c, { path: `/api/v1/images/${name}` });
});
