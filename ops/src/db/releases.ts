import type { ReleaseInput, StoredRelease, StoredReleaseAsset } from "../domain/release.ts";
import type { Db } from "./database.ts";

type ReleaseRow = {
  version: string;
  notes: string;
  pub_date: string;
  published: number;
  created_at: string;
  updated_at: string;
};

type AssetRow = {
  id: number;
  version: string;
  kind: StoredReleaseAsset["kind"];
  platform: string;
  url: string;
  signature: string;
};

function toRelease(row: ReleaseRow, assets: StoredReleaseAsset[]): StoredRelease {
  return {
    version: row.version,
    notes: row.notes,
    pubDate: row.pub_date,
    published: row.published === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assets,
  };
}

async function assetsFor(db: Db, versions: string[]): Promise<Map<string, StoredReleaseAsset[]>> {
  const grouped = new Map<string, StoredReleaseAsset[]>();
  if (versions.length === 0) {
    return grouped;
  }
  const placeholders = versions.map(() => "?").join(", ");
  const rows = await db.all<AssetRow>(
    `SELECT id, version, kind, platform, url, signature FROM release_assets WHERE version IN (${placeholders})`,
    ...versions,
  );
  for (const row of rows) {
    const list = grouped.get(row.version) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      platform: row.platform,
      url: row.url,
      signature: row.signature,
    });
    grouped.set(row.version, list);
  }
  return grouped;
}

export async function listReleases(db: Db): Promise<StoredRelease[]> {
  const rows = await db.all<ReleaseRow>("SELECT * FROM releases");
  const assets = await assetsFor(
    db,
    rows.map((row) => row.version),
  );
  return rows.map((row) => toRelease(row, assets.get(row.version) ?? []));
}

export async function getRelease(db: Db, version: string): Promise<StoredRelease | null> {
  const row = await db.first<ReleaseRow>("SELECT * FROM releases WHERE version = ?", version);
  if (!row) {
    return null;
  }
  const assets = await assetsFor(db, [version]);
  return toRelease(row, assets.get(version) ?? []);
}

export async function upsertRelease(db: Db, value: ReleaseInput, now: string): Promise<void> {
  const existing = await db.first<ReleaseRow>("SELECT * FROM releases WHERE version = ?", value.version);
  const pubDate = value.pubDate ?? existing?.pub_date ?? now;
  const createdAt = existing?.created_at ?? now;
  await db.batch([
    {
      sql: `INSERT INTO releases (version, notes, pub_date, published, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(version) DO UPDATE SET
              notes = excluded.notes,
              pub_date = excluded.pub_date,
              published = excluded.published,
              updated_at = excluded.updated_at`,
      params: [value.version, value.notes, pubDate, value.published ? 1 : 0, createdAt, now],
    },
    {
      sql: "DELETE FROM release_assets WHERE version = ?",
      params: [value.version],
    },
    ...value.assets.map((asset) => ({
      sql: `INSERT INTO release_assets (version, kind, platform, url, signature)
            VALUES (?, ?, ?, ?, ?)`,
      params: [value.version, asset.kind, asset.platform, asset.url, asset.signature],
    })),
  ]);
}

export async function deleteRelease(db: Db, version: string): Promise<boolean> {
  await db.run("DELETE FROM release_assets WHERE version = ?", version);
  const result = await db.run("DELETE FROM releases WHERE version = ?", version);
  return result.changes > 0;
}
