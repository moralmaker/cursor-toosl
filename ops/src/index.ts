import { Hono } from "hono";
import { loginRoute, sessionRoutes } from "./admin/auth.ts";
import { auditRoutes } from "./admin/audit.ts";
import { dismissalRoutes } from "./admin/dismissals.ts";
import { downloadStatsRoutes } from "./admin/download-stats.ts";
import { imageRoutes } from "./admin/images.ts";
import { requireMutatingGuards, requireSession } from "./admin/middleware.ts";
import { releaseRoutes } from "./admin/releases.ts";
import { slotRoutes } from "./admin/slots.ts";
import type { AppEnv } from "./http.ts";
import { json } from "./http.ts";
import { adsRoutes } from "./public/ads.ts";
import { changelogPublicRoutes } from "./public/changelog.ts";
import { imagePublicRoutes } from "./public/images.ts";
import { releaseAssetPublicRoutes } from "./public/release-assets.ts";
import { updateRoutes } from "./public/updates.ts";
import { applySecurityHeaders } from "./security/headers.ts";

const app = new Hono<AppEnv>();

app.onError((error, c) => {
  console.error(error);
  return json(c, { error: "internal error" }, 500);
});

app.notFound((c) => json(c, { error: "not found" }, 404));

app.route("/", adsRoutes);
app.route("/", updateRoutes);
app.route("/", releaseAssetPublicRoutes);
app.route("/", imagePublicRoutes);
app.route("/", changelogPublicRoutes);
app.route("/api/admin", loginRoute);

const protectedAdmin = new Hono<AppEnv>();
protectedAdmin.use("*", requireSession);
protectedAdmin.use("*", requireMutatingGuards);
protectedAdmin.route("/", sessionRoutes);
protectedAdmin.route("/slots", slotRoutes);
protectedAdmin.route("/images", imageRoutes);
protectedAdmin.route("/releases", releaseRoutes);
protectedAdmin.route("/dismissals", dismissalRoutes);
protectedAdmin.route("/download-stats", downloadStatsRoutes);
protectedAdmin.route("/audit", auditRoutes);
app.route("/api/admin", protectedAdmin);

app.get("/", (c) => c.redirect("/download/", 302));
app.get("/download", (c) => c.redirect("/download/", 302));
app.get("/download/changelog", (c) => c.redirect("/download/changelog/", 302));

app.all("*", async (c) => {
  const url = new URL(c.req.url);
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    const assetPath =
      url.pathname === "/admin" || url.pathname === "/admin/"
        ? "/admin/index.html"
        : `/admin${url.pathname.slice("/admin".length) || "/index.html"}`;
    const assetUrl = new URL(assetPath + url.search, url.origin);
    const response = await c.env.ASSETS.fetch(new Request(assetUrl, c.req.raw));
    if (response.status === 404 && !assetPath.includes(".")) {
      return c.env.ASSETS.fetch(new Request(new URL("/admin/index.html", url.origin), c.req.raw));
    }
    return response;
  }
  if (url.pathname === "/download/" || url.pathname === "/download/index.html") {
    return c.env.ASSETS.fetch(new Request(new URL("/download/index.html", url.origin), c.req.raw));
  }
  if (url.pathname === "/download/guide.html") {
    return c.env.ASSETS.fetch(new Request(new URL("/download/guide.html", url.origin), c.req.raw));
  }
  if (
    url.pathname === "/download/changelog/" ||
    url.pathname === "/download/changelog/index.html" ||
    /^\/download\/changelog\/[^/]+\/?$/.test(url.pathname)
  ) {
    return c.env.ASSETS.fetch(new Request(new URL("/download/changelog/index.html", url.origin), c.req.raw));
  }
  return json(c, { error: "not found" }, 404);
});

export default {
  async fetch(request: Request, env: AppEnv["Bindings"], ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const response = await app.fetch(request, env, ctx);
    return applySecurityHeaders(response, url.pathname, url.protocol === "https:");
  },
};
