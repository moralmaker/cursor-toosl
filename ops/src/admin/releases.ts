import { Hono } from "hono";
import { deleteRelease, getRelease, listReleases, upsertRelease } from "../db/releases.ts";
import { writeAudit } from "../db/audit.ts";
import {
  manifestFromGithubJson,
  parseGithubImport,
  parseReleaseInput,
  type ReleaseInput,
} from "../domain/release.ts";
import { isSemver } from "../domain/semver.ts";
import type { AppEnv } from "../http.ts";
import { clientIp, dbFrom, json, readJson } from "../http.ts";
import { ADMIN_BODY_MAX } from "./middleware.ts";

export const releaseRoutes = new Hono<AppEnv>();

releaseRoutes.get("/", async (c) => json(c, { releases: await listReleases(dbFrom(c)) }));

releaseRoutes.post("/", async (c) => {
  const parsed = await readJson(c, ADMIN_BODY_MAX);
  if ("error" in parsed) {
    return json(c, { error: parsed.error }, parsed.status);
  }
  const input = parseReleaseInput(parsed.value);
  if ("errors" in input) {
    return json(c, { error: input.errors.join("; ") }, 400);
  }
  const db = dbFrom(c);
  if (await getRelease(db, input.value.version)) {
    return json(c, { error: "version already exists" }, 409);
  }
  await upsertRelease(db, input.value, new Date().toISOString());
  await writeAudit(db, {
    action: "release.create",
    actor: "admin",
    detail: input.value.version,
    ip: clientIp(c),
  });
  return json(c, { version: input.value.version });
});

releaseRoutes.put("/:version", async (c) => {
  const version = c.req.param("version");
  if (!isSemver(version)) {
    return json(c, { error: "invalid version" }, 400);
  }
  const parsed = await readJson(c, ADMIN_BODY_MAX);
  if ("error" in parsed) {
    return json(c, { error: parsed.error }, parsed.status);
  }
  const input = parseReleaseInput({ ...(parsed.value as object), version });
  if ("errors" in input) {
    return json(c, { error: input.errors.join("; ") }, 400);
  }
  const db = dbFrom(c);
  if (!(await getRelease(db, version))) {
    return json(c, { error: "not found" }, 404);
  }
  await upsertRelease(db, input.value, new Date().toISOString());
  await writeAudit(db, { action: "release.update", actor: "admin", detail: version, ip: clientIp(c) });
  return json(c, { ok: true });
});

releaseRoutes.delete("/:version", async (c) => {
  const version = c.req.param("version");
  if (!isSemver(version)) {
    return json(c, { error: "invalid version" }, 400);
  }
  const deleted = await deleteRelease(dbFrom(c), version);
  if (!deleted) {
    return json(c, { error: "not found" }, 404);
  }
  await writeAudit(dbFrom(c), { action: "release.delete", actor: "admin", detail: version, ip: clientIp(c) });
  return json(c, { ok: true });
});

releaseRoutes.post("/import-github", async (c) => {
  const parsed = await readJson(c, ADMIN_BODY_MAX);
  if ("error" in parsed) {
    return json(c, { error: parsed.error }, parsed.status);
  }
  const input = parseGithubImport(parsed.value);
  if ("errors" in input) {
    return json(c, { error: input.errors.join("; ") }, 400);
  }

  const [installer, portable] = await Promise.all([
    fetchGithubManifest(input.value.repository, "latest.json"),
    fetchGithubManifest(input.value.repository, "portable-latest.json"),
  ]);
  if ("error" in installer && "error" in portable) {
    return json(c, { error: installer.error }, 502);
  }

  const merged = mergeImports(
    "value" in installer ? installer.value : null,
    "value" in portable ? portable.value : null,
  );
  if ("errors" in merged) {
    return json(c, { error: merged.errors.join("; ") }, 400);
  }

  const db = dbFrom(c);
  const existing = await getRelease(db, merged.value.version);
  const toSave: ReleaseInput = {
    ...merged.value,
    // 导入资产时保留已编辑的更新日志，避免被空默认值覆盖。
    changelogTitle: existing?.changelogTitle ?? "",
    changelogBody: existing?.changelogBody ?? "",
    changelogVisible: existing?.changelogVisible ?? false,
  };
  await upsertRelease(db, toSave, new Date().toISOString());
  await writeAudit(db, {
    action: "release.import",
    actor: "admin",
    detail: `${input.value.repository}@${merged.value.version}`,
    ip: clientIp(c),
  });
  return json(c, { version: merged.value.version, assets: merged.value.assets.length });
});

async function fetchGithubManifest(
  repository: string,
  file: "latest.json" | "portable-latest.json",
): Promise<{ value: unknown } | { error: string }> {
  const url = `https://github.com/${repository}/releases/latest/download/${file}`;
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      return { error: `${file} HTTP ${response.status}` };
    }
    return { value: await response.json() };
  } catch {
    return { error: `failed to fetch ${file}` };
  }
}

function mergeImports(
  installer: unknown,
  portable: unknown,
): { value: ReleaseInput } | { errors: string[] } {
  const installerParsed = installer ? manifestFromGithubJson(installer, "installer") : null;
  const portableParsed = portable ? manifestFromGithubJson(portable, "portable") : null;
  if (installerParsed && "errors" in installerParsed && portableParsed && "errors" in portableParsed) {
    return { errors: [...installerParsed.errors, ...portableParsed.errors] };
  }
  if (installerParsed && "errors" in installerParsed && !portableParsed) {
    return installerParsed;
  }
  if (portableParsed && "errors" in portableParsed && !installerParsed) {
    return portableParsed;
  }
  const primary = installerParsed && "value" in installerParsed ? installerParsed.value : null;
  const secondary = portableParsed && "value" in portableParsed ? portableParsed.value : null;
  if (primary && secondary && primary.version !== secondary.version) {
    return { errors: [`installer ${primary.version} and portable ${secondary.version} differ`] };
  }
  const base = primary ?? secondary;
  if (!base) {
    return { errors: ["no importable manifest"] };
  }
  return {
    value: {
      ...base,
      notes: primary?.notes || secondary?.notes || base.notes,
      assets: [...(primary?.assets ?? []), ...(secondary?.assets ?? [])],
      published: true,
    },
  };
}
