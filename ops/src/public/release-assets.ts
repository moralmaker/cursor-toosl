import { Hono } from "hono";
import { type AppEnv, json } from "../http.ts";

const ASSET_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/;

export const releaseAssetPublicRoutes = new Hono<AppEnv>();

releaseAssetPublicRoutes.get("/api/v1/updates/assets/:name", async (c) => {
  const name = c.req.param("name");
  if (!ASSET_NAME_RE.test(name)) {
    return json(c, { error: "not found" }, 404);
  }
  const object = await c.env.RELEASES.get(name);
  if (!object) {
    return json(c, { error: "not found" }, 404);
  }
  const headers: Record<string, string> = {
    "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
    "Content-Length": String(object.size),
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: object.httpEtag,
    "Content-Disposition": `attachment; filename="${name}"`,
  };
  if (c.req.header("If-None-Match") === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(object.body, { headers });
});
