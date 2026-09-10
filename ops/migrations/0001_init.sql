-- cursor-tools-ops 初始表结构
-- wrangler d1 migrations apply cursor-tools-ops --local|--remote

CREATE TABLE IF NOT EXISTS slots (
  id          TEXT PRIMARY KEY,
  enabled     INTEGER NOT NULL DEFAULT 1,
  placement   TEXT NOT NULL DEFAULT 'menu',
  locale      TEXT NOT NULL DEFAULT 'all',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  starts_at   TEXT,
  ends_at     TEXT,
  target      TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_slots_public
  ON slots(enabled, placement, locale, sort_order);

CREATE TABLE IF NOT EXISTS ad_dismissals (
  ad_id       TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  os          TEXT,
  app_version TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (ad_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_dismissals_ad ON ad_dismissals(ad_id, updated_at);

CREATE TABLE IF NOT EXISTS releases (
  version     TEXT PRIMARY KEY,
  notes       TEXT NOT NULL DEFAULT '',
  pub_date    TEXT NOT NULL,
  published   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_releases_published ON releases(published, pub_date);

CREATE TABLE IF NOT EXISTS release_assets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  version     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  platform    TEXT NOT NULL,
  url         TEXT NOT NULL,
  signature   TEXT NOT NULL,
  UNIQUE (version, kind, platform),
  FOREIGN KEY (version) REFERENCES releases(version) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_release_assets_lookup
  ON release_assets(version, kind);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  key           TEXT PRIMARY KEY,
  attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,
  window_start  TEXT,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  action      TEXT NOT NULL,
  actor       TEXT NOT NULL,
  detail      TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
