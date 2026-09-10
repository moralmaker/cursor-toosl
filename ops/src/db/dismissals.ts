import type { Db } from "./database.ts";

export type DismissalRow = {
  ad_id: string;
  device_id: string;
  reason: string;
  os: string | null;
  app_version: string | null;
  created_at: string;
  updated_at: string;
};

export type DismissalSummary = {
  adId: string;
  count: number;
  lastReason: string;
  lastAt: string;
};

export async function upsertDismissal(
  db: Db,
  input: {
    adId: string;
    deviceId: string;
    reason: string;
    os: string;
    appVersion: string;
    now: string;
  },
): Promise<void> {
  await db.run(
    `INSERT INTO ad_dismissals (ad_id, device_id, reason, os, app_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ad_id, device_id) DO UPDATE SET
       reason = excluded.reason,
       os = excluded.os,
       app_version = excluded.app_version,
       updated_at = excluded.updated_at`,
    input.adId,
    input.deviceId,
    input.reason,
    input.os,
    input.appVersion,
    input.now,
    input.now,
  );
}

export async function listDismissals(db: Db, adId?: string): Promise<DismissalRow[]> {
  if (adId) {
    return db.all<DismissalRow>(
      "SELECT * FROM ad_dismissals WHERE ad_id = ? ORDER BY updated_at DESC LIMIT 200",
      adId,
    );
  }
  return db.all<DismissalRow>("SELECT * FROM ad_dismissals ORDER BY updated_at DESC LIMIT 200");
}

export async function summarizeDismissals(db: Db): Promise<DismissalSummary[]> {
  const rows = await db.all<{
    ad_id: string;
    count: number;
    last_reason: string;
    last_at: string;
  }>(
    `SELECT ad_id,
            COUNT(*) AS count,
            (SELECT reason FROM ad_dismissals d2 WHERE d2.ad_id = d1.ad_id ORDER BY updated_at DESC LIMIT 1) AS last_reason,
            MAX(updated_at) AS last_at
     FROM ad_dismissals d1
     GROUP BY ad_id
     ORDER BY count DESC`,
  );
  return rows.map((row) => ({
    adId: row.ad_id,
    count: row.count,
    lastReason: row.last_reason,
    lastAt: row.last_at,
  }));
}
