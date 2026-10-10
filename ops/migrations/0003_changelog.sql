-- 公开更新日志字段（与 Tauri updater 的短 notes 分离）
ALTER TABLE releases ADD COLUMN changelog_title TEXT NOT NULL DEFAULT '';
ALTER TABLE releases ADD COLUMN changelog_body TEXT NOT NULL DEFAULT '';
ALTER TABLE releases ADD COLUMN changelog_visible INTEGER NOT NULL DEFAULT 0;
