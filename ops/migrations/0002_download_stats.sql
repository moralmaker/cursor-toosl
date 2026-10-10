-- 下载统计：按日聚合（UTC）
CREATE TABLE IF NOT EXISTS download_stats_daily (
  day         TEXT NOT NULL,
  version     TEXT NOT NULL,
  platform    TEXT NOT NULL,
  asset_name  TEXT NOT NULL,
  channel     TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, version, platform, asset_name)
);
CREATE INDEX IF NOT EXISTS idx_download_stats_day ON download_stats_daily(day);
CREATE INDEX IF NOT EXISTS idx_download_stats_version ON download_stats_daily(version, day);
