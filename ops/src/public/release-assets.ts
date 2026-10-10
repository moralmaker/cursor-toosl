import { Hono } from "hono";
import { bumpDownloadStat } from "../db/download-stats.ts";
import { shouldCountDownload } from "../domain/download-stats.ts";
import { type AppEnv, dbFrom, json } from "../http.ts";

const ASSET_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/;

export const releaseAssetPublicRoutes = new Hono<AppEnv>();

releaseAssetPublicRoutes.get("/api/v1/updates/assets/*", async (c) => {
  const name = decodeURIComponent(c.req.path.replace(/^\/api\/v1\/updates\/assets\//, ""));
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
    // 浏览器可缓存；禁止 CDN 共享缓存，否则计数逻辑不会执行。
    "Cache-Control": "private, max-age=31536000, immutable",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    ETag: object.httpEtag,
    "Content-Disposition": `attachment; filename="${name}"`,
  };
  if (c.req.header("If-None-Match") === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }

  // 大文件流式响应时 waitUntil 不可靠：先写入再开始传文件。
  if (shouldCountDownload(name)) {
    try {
      await bumpDownloadStat(dbFrom(c), name);
    } catch (error) {
      console.error("download stat bump failed", name, error);
    }
  }

  return new Response(object.body, { headers });
});
