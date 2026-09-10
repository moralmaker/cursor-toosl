-- 可选种子：3 条示例广告位（迁移自 placement-admin）
-- wrangler d1 execute cursor-tools-ops --file=seed.sql --local|--remote

INSERT OR REPLACE INTO slots (
  id, enabled, placement, locale, sort_order, starts_at, ends_at, target, content, created_at, updated_at
) VALUES (
  '59304605-01b6-4787-897f-8c7184bb54fc',
  1,
  'menu',
  'all',
  0,
  NULL,
  NULL,
  '{"title":"作者寄语","description":"❤️由于无精力管理大量群聊 我们不得不解散大部分群聊","imageUrl":"https://tab.leokun.cn/uploads/5702812b-af30-4099-9898-d4b38ac26d25.jpg"}',
  '{"title":"❤️由于无精力管理大量群聊","description":"我们解散了大部分不活跃或广告泛滥的群聊\n本项目百分百MIT开源，麻烦兄弟们点击star支持一下\n\n","imageUrl":"https://tab.leokun.cn/uploads/3eec81a4-1c21-4f28-b213-86764f4c1f18.png","details":[{"label":"目前仅剩圈子","value":"次要 QQ群: 1095916242\n主圈子TG https://t.me/cursor_byok "},{"label":"开源路线图","value":"https://github.com/moralmaker/cursor-toosl/discussions/32"},{"label":"0.1.7已发布","value":"它是正式版之前的最后一个版本 下载或更新地址(windows用户务必下载.setup 安装包)： https://github.com/moralmaker/cursor-toosl/releases"},{"label":"文档地址","value":"https://docs.leokun.cn/zh\n之前被cursor举报了"}],"button":{"label":"🌟点击Star支持作者","action":{"type":"open_browser","url":"https://github.com/moralmaker/cursor-toosl"}}}',
  '2026-09-09T09:55:16.914Z',
  '2026-09-09T09:55:16.914Z'
);

INSERT OR REPLACE INTO slots (
  id, enabled, placement, locale, sort_order, starts_at, ends_at, target, content, created_at, updated_at
) VALUES (
  '7b6efd3a-f33b-4f87-bbf3-1c4f771c9cb2',
  1,
  'menu',
  'all',
  1,
  NULL,
  NULL,
  '{"title":"一元中转站","description":"性价比之选","imageUrl":"https://tab.leokun.cn/uploads/bc9b5804-d611-413c-a2b7-f9e8a050da1e.webp"}',
  '{"title":"1元中转站","description":"1元畅享 GPT-5.6\n全网最低，没有之一，注册即送体验额度，全系模型免费试用，先体验再充值。","imageUrl":"https://tab.leokun.cn/uploads/a3a0b3da-0252-4e33-bf93-f0f0b11a08e5.webp","details":[{"label":"🔥1元官方交流群","value":"QQ 339252579"},{"label":"🔥价格够狠","value":"1 人民币兑换 5 美元额度，订阅再享 6.6 折，真正做到低成本高频使用。"}],"button":{"label":"立即访问","action":{"type":"open_browser","url":"https://www.mxou.ai/register?aff=GWS6PJ8HDUN7"}}}',
  '2026-09-09T09:55:16.914Z',
  '2026-09-09T09:55:16.914Z'
);

INSERT OR REPLACE INTO slots (
  id, enabled, placement, locale, sort_order, starts_at, ends_at, target, content, created_at, updated_at
) VALUES (
  'a8d40749-0a14-4d84-87fc-c382d8b77f40',
  1,
  'menu',
  'all',
  2,
  NULL,
  NULL,
  '{"title":"Cursor官方中转","description":"Pro / Ultra 账号无感切号｜Cursor官方中转","imageUrl":"https://tab.leokun.cn/uploads/889cf37f-5ecb-46c1-8ec7-c2f153985a58.webp"}',
  '{"title":"Cursor无感切号复活","description":"官网模型，假一赔百，Cursor官方Pro / Ultra 账号无感切号","imageUrl":"https://tab.leokun.cn/uploads/ad450ada-3bfd-4944-baad-7f5726f78178.webp","details":[{"label":"🔥 ¥1 ≈ $1 官方高级模型额度-官方模型-承诺假一赔百","value":"GPT-5.5 / Fable 5 无限用 满速满智无降智，内置 Pro / Ultra 账号无感切号，免魔法直连\n"},{"label":"🔥  QQ交流群","value":"QQ群8666590"}],"button":{"label":"立即查看","action":{"type":"open_browser","url":"https://cursor.aicodings.club/user/login?ref=8T8JEG&mode=register"}}}',
  '2026-09-09T09:55:16.914Z',
  '2026-09-09T09:55:16.914Z'
);
