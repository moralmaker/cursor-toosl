import { classifyAssetName, type DownloadChannel, utcDay } from "../domain/download-stats.ts";
import type { Db } from "./database.ts";

export type DownloadStatRow = {
  day: string;
  version: string;
  platform: string;
  asset_name: string;
  channel: DownloadChannel;
  count: number;
};

export type DownloadStatsSummary = {
  totals: { downloads: number; days: number };
  today: number;
  last7Days: number;
  last30Days: number;
  byDay: Array<{ day: string; count: number }>;
  byVersion: Array<{ version: string; count: number }>;
  byPlatform: Array<{ platform: string; count: number }>;
  byAsset: Array<{
    assetName: string;
    version: string;
    platform: string;
    channel: DownloadChannel;
    count: number;
  }>;
};

export async function bumpDownloadStat(
  db: Db,
  assetName: string,
  day = utcDay(),
): Promise<void> {
  // 仅用文件名解析，避免对含 `_` 的名字做 SQL LIKE（D1 会报 pattern too complex）。
  const meta = classifyAssetName(assetName);
  await db.run(
    `INSERT INTO download_stats_daily (day, version, platform, asset_name, channel, count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(day, version, platform, asset_name) DO UPDATE SET
       count = download_stats_daily.count + 1,
       channel = excluded.channel`,
    day,
    meta.version,
    meta.platform,
    assetName,
    meta.channel,
  );
}

export async function queryDownloadStats(
  db: Db,
  from: string,
  to: string,
): Promise<DownloadStatsSummary> {
  const today = utcDay();
  const last7 = shiftDay(today, -6);
  const last30 = shiftDay(today, -29);

  const [rangeRows, todayRow, weekRow, monthRow] = await Promise.all([
    db.all<DownloadStatRow>(
      `SELECT day, version, platform, asset_name, channel, count
       FROM download_stats_daily
       WHERE day >= ? AND day <= ?`,
      from,
      to,
    ),
    db.first<{ total: number }>(
      `SELECT COALESCE(SUM(count), 0) AS total FROM download_stats_daily WHERE day = ?`,
      today,
    ),
    db.first<{ total: number }>(
      `SELECT COALESCE(SUM(count), 0) AS total FROM download_stats_daily WHERE day >= ? AND day <= ?`,
      last7,
      today,
    ),
    db.first<{ total: number }>(
      `SELECT COALESCE(SUM(count), 0) AS total FROM download_stats_daily WHERE day >= ? AND day <= ?`,
      last30,
      today,
    ),
  ]);

  const byDayMap = new Map<string, number>();
  const byVersionMap = new Map<string, number>();
  const byPlatformMap = new Map<string, number>();
  const byAssetMap = new Map<
    string,
    { assetName: string; version: string; platform: string; channel: DownloadChannel; count: number }
  >();

  let downloads = 0;
  for (const row of rangeRows) {
    downloads += row.count;
    byDayMap.set(row.day, (byDayMap.get(row.day) ?? 0) + row.count);
    byVersionMap.set(row.version, (byVersionMap.get(row.version) ?? 0) + row.count);
    byPlatformMap.set(row.platform, (byPlatformMap.get(row.platform) ?? 0) + row.count);
    const existing = byAssetMap.get(row.asset_name);
    if (existing) {
      existing.count += row.count;
    } else {
      byAssetMap.set(row.asset_name, {
        assetName: row.asset_name,
        version: row.version,
        platform: row.platform,
        channel: row.channel,
        count: row.count,
      });
    }
  }

  const byDay = fillDays(from, to).map((day) => ({ day, count: byDayMap.get(day) ?? 0 }));

  return {
    totals: { downloads, days: byDay.length },
    today: Number(todayRow?.total ?? 0),
    last7Days: Number(weekRow?.total ?? 0),
    last30Days: Number(monthRow?.total ?? 0),
    byDay,
    byVersion: sortCount(byVersionMap).map(([version, count]) => ({ version, count })),
    byPlatform: sortCount(byPlatformMap).map(([platform, count]) => ({ platform, count })),
    byAsset: [...byAssetMap.values()].sort((a, b) => b.count - a.count || a.assetName.localeCompare(b.assetName)),
  };
}

function sortCount(map: Map<string, number>): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return utcDay(date);
}

function fillDays(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    cursor = shiftDay(cursor, 1);
  }
  return days;
}
