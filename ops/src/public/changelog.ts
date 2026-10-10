import { Hono } from "hono";
import { getRelease, listReleases } from "../db/releases.ts";
import {
  isChangelogPublic,
  sortChangelog,
  toChangelogDetail,
  toChangelogListItem,
} from "../domain/changelog.ts";
import { isSemver } from "../domain/semver.ts";
import { type AppEnv, dbFrom, json } from "../http.ts";

export const changelogPublicRoutes = new Hono<AppEnv>();

changelogPublicRoutes.get("/api/v1/changelog", async (c) => {
  const items = sortChangelog(await listReleases(dbFrom(c))).map(toChangelogListItem);
  return json(
    c,
    { items },
    200,
    {
      "Cache-Control": `public, max-age=${Number.parseInt(c.env.PUBLIC_CACHE_TTL || "300", 10) || 300}`,
    },
  );
});

changelogPublicRoutes.get("/api/v1/changelog/:version", async (c) => {
  const version = c.req.param("version");
  if (!isSemver(version)) {
    return json(c, { error: "not found" }, 404);
  }
  const release = await getRelease(dbFrom(c), version);
  if (!release || !isChangelogPublic(release)) {
    return json(c, { error: "not found" }, 404);
  }
  return json(c, toChangelogDetail(release), 200, {
    "Cache-Control": `public, max-age=${Number.parseInt(c.env.PUBLIC_CACHE_TTL || "300", 10) || 300}`,
  });
});
