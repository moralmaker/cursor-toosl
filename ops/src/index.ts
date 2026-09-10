import { Hono } from "hono";
import { loginRoute, sessionRoutes } from "./admin/auth.ts";
import { auditRoutes } from "./admin/audit.ts";
import { dismissalRoutes } from "./admin/dismissals.ts";
import { requireMutatingGuards, requireSession } from "./admin/middleware.ts";
import { releaseRoutes } from "./admin/releases.ts";
import { slotRoutes } from "./admin/slots.ts";
import type { AppEnv } from "./http.ts";
import { json } from "./http.ts";
import { adsRoutes } from "./public/ads.ts";
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
app.route("/api/admin", loginRoute);

const protectedAdmin = new Hono<AppEnv>();
protectedAdmin.use("*", requireSession);
protectedAdmin.use("*", requireMutatingGuards);
protectedAdmin.route("/", sessionRoutes);
protectedAdmin.route("/slots", slotRoutes);
protectedAdmin.route("/releases", releaseRoutes);
protectedAdmin.route("/dismissals", dismissalRoutes);
protectedAdmin.route("/audit", auditRoutes);
app.route("/api/admin", protectedAdmin);

app.get("/", (c) => c.redirect("/admin/", 302));

app.all("*", async (c) => {
  const url = new URL(c.req.url);
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
    const assetPath =
      url.pathname === "/admin" || url.pathname === "/admin/"
        ? "/index.html"
        : url.pathname.slice("/admin".length) || "/index.html";
    const assetUrl = new URL(assetPath + url.search, url.origin);
    const response = await c.env.ASSETS.fetch(new Request(assetUrl, c.req.raw));
    if (response.status === 404 && !assetPath.includes(".")) {
      return c.env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), c.req.raw));
    }
    return response;
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
