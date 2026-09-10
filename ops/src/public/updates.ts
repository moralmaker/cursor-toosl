import { Hono } from "hono";
import type { Context } from "hono";
import { listReleases } from "../db/releases.ts";
import { buildTauriManifest, pickLatestPublished } from "../domain/release.ts";
import { type AppEnv, dbFrom } from "../http.ts";
import { sha256Hex } from "../security/crypto.ts";

export const updateRoutes = new Hono<AppEnv>();

updateRoutes.get("/api/v1/updates/latest.json", (c) => serveManifest(c, "installer"));
updateRoutes.get("/api/v1/updates/portable-latest.json", (c) => serveManifest(c, "portable"));

async function serveManifest(c: Context<AppEnv>, kind: "installer" | "portable"): Promise<Response> {
  const latest = pickLatestPublished(await listReleases(dbFrom(c)));
  const manifest = latest ? buildTauriManifest(latest, kind) : null;
  if (!manifest) {
    return new Response(null, { status: 204, headers: cacheHeaders(c, '""') });
  }
  const body = `${JSON.stringify(manifest)}\n`;
  const etag = `"${await sha256Hex(body)}"`;
  const headers = cacheHeaders(c, etag);
  if (c.req.header("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cacheHeaders(c: Context<AppEnv>, etag: string): Record<string, string> {
  const ttl = Number.parseInt(c.env.PUBLIC_CACHE_TTL || "300", 10) || 300;
  return {
    ETag: etag,
    "Cache-Control": `public, max-age=${ttl}`,
  };
}
