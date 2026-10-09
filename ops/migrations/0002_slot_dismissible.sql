-- 广告位是否允许用户在客户端关闭
ALTER TABLE slots ADD COLUMN dismissible INTEGER NOT NULL DEFAULT 1;
