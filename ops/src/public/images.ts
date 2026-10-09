import { Hono } from "hono";
import { parseImageName } from "../domain/image.ts";
import { type AppEnv, json } from "../http.ts";

export const imagePublicRoutes = new Hono<AppEnv>();

imagePublicRoutes.get("/api/v1/images/:name", async (c) => {
  const name = c.req.param("name");
  const format = parseImageName(name);
  if (!format) {
    return json(c, { error: "not found" }, 404);
  }
  const object = await c.env.IMAGES.get(name);
  if (!object) {
    return json(c, { error: "not found" }, 404);
  }
  const headers = {
    "Content-Type": format.contentType,
    "Content-Length": String(object.size),
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: object.httpEtag,
  };
  if (c.req.header("If-None-Match") === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(object.body, { headers });
});
