# Cursor TOOLS 运营服务

部署于 Cloudflare 免费环境的广告下发 + 桌面更新清单服务，并带可视化管理台。

客户端契约见仓库 [`docs/external-apis.md`](../docs/external-apis.md) 第 1、3 节。本目录实现这些接口，不实现公益 TAB / 模型网关。

## 目录

```
ops/
├── migrations/0001_init.sql   # D1 表结构
├── seed.sql                   # 可选：3 条示例广告位
├── scripts/hash-password.mjs  # 生成 ADMIN_PASSWORD_HASH
├── src/                       # Worker：公共接口 + 管理 API
└── admin-ui/                  # React 管理台（构建后由 Worker 托管）
```

存储：D1 存广告位 / 版本 / 会话 / 审计；R2 桶 `cursor-tools-ops-images` 存管理台上传的广告图；R2 桶 `cursor-tools-ops-releases` 存桌面更新包（`GET /api/v1/updates/assets/:name`），避免客户端直连 GitHub 过慢。

## 接口契约

### 拉取广告

```
GET /api/v1/ads?placement=menu
```

必填头：

| 头 | 值 |
|---|---|
| `X-Cursor-Assistant-Device-ID` | 安装 UUID |
| `X-Cursor-Assistant-OS` | `macos` / `linux` / `windows` |
| `X-Cursor-Assistant-Version` | 如 `0.1.7` |
| `accept-language` | 含 `zh-CN` 则中文，否则 `en-US` |
| `disable-ad-ids` | 可选，逗号分隔 |

成功响应 `application/json`：

```json
{
  "slots": [
    {
      "id": "59304605-01b6-4787-897f-8c7184bb54fc",
      "enabled": true,
      "placement": "menu",
      "target": { "title": "…", "description": "…", "imageUrl": "https://…" },
      "content": {
        "title": "…",
        "description": "…",
        "imageUrl": "https://…",
        "details": [{ "label": "价格", "value": "免费" }],
        "button": { "label": "打开", "action": { "type": "open_browser", "url": "https://…" } }
      }
    }
  ]
}
```

`dismissible`（管理台「允许用户关闭」）为 `false` 时，客户端不显示关闭按钮，`disable-ad-ids` 对该 slot 不生效，之前关闭过的用户也会重新看到。

`content.button` 可省略（管理台按钮文案与链接都留空即可）。`X-Cursor-Assistant-Version` ≤ 1.0.0 的客户端把按钮当必填，不会收到无按钮的 slot。

附加头：`X-Content-Signature: sha256=<HMAC-SHA256(SIGNING_SECRET, raw body)>`。`placement` 不是 `menu` 或缺头时返回 400。

### 关闭广告

```
POST /api/v1/ads/{ad_id}/dismissals
Content-Type: application/json
{ "reason": "非空字符串" }
```

同上设备 / OS / 版本头。任意 2xx 即可，本服务返回 204。按 `(ad_id, device_id)` upsert。

### 广告图

```
POST /api/admin/images          # 需登录；请求体为图片原始字节
GET  /api/v1/images/{sha256}.{png|jpg|gif|webp|avif}
```

上传按文件头识别格式（拒绝 SVG / HTML），上限 10 MiB，与桌面端缓存限制一致。对象以内容 SHA-256 命名，公开地址永久缓存（`immutable`）。管理台图片字段既可上传，也可直接填外链。

### 更新清单

```
GET /api/v1/updates/latest.json
GET /api/v1/updates/portable-latest.json
```

形状与 Tauri updater 静态清单 / 便携清单相同。无已发布版本时返回 204。带 ETag 与 `Cache-Control: public, max-age=300`。

## 部署（Cloudflare 免费计划）

```bash
cd ops
npm install
npx wrangler login
npx wrangler d1 create cursor-tools-ops
npx wrangler r2 bucket create cursor-tools-ops-images
npx wrangler r2 bucket create cursor-tools-ops-releases
# 上传更新包示例（把 latest.json 里对应平台的 url 改成下方公开地址）：
# npx wrangler r2 object put cursor-tools-ops-releases/<asset> --file=<local> --content-type=application/octet-stream --remote
# 公开地址：https://ops.susuan.ai/api/v1/updates/assets/<asset>
```

把返回的 `database_id` 填进 [`wrangler.jsonc`](wrangler.jsonc)。

```bash
npx wrangler d1 migrations apply cursor-tools-ops --remote
# 可选
npx wrangler d1 execute cursor-tools-ops --remote --file=seed.sql

npm run hash-password
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put SIGNING_SECRET          # 32+ 位随机串
# 可选二次验证
# npx wrangler secret put ADMIN_TOTP_SECRET     # Base32，如 otpauth 密钥

npm run deploy
```

部署后：

- 管理台：`https://<worker>.workers.dev/admin/`
- 广告：`https://<worker>.workers.dev/api/v1/ads?placement=menu`
- 更新：`https://<worker>.workers.dev/api/v1/updates/latest.json`

绑定自定义域后，把客户端常量改成该域。仓库里暂用占位 `https://ops.susuan.ai`。

本地：

```bash
cp .dev.vars.example .dev.vars
npm run hash-password            # 把输出写入 .dev.vars 的 ADMIN_PASSWORD_HASH
npx wrangler d1 migrations apply cursor-tools-ops --local
npx wrangler d1 execute cursor-tools-ops --local --file=seed.sql
npm run dev                      # http://127.0.0.1:8787/admin/ ，R2 由 wrangler 本地模拟
npm test
```

## 安全

- 管理登录：用户名 + 自描述 PBKDF2-SHA256 密码哈希（默认 10 000 次迭代，适配免费版 10 ms CPU）。可选 TOTP。
- 会话：256 bit 随机 token，库中只存 SHA-256，12 小时过期；Cookie `HttpOnly; SameSite=Strict; Path=/`，HTTPS 下加 `Secure`。
- 写操作：同源 `Origin` / `Sec-Fetch-Site` + `X-Requested-With`。
- 注入：D1 参数化查询 + Zod 白名单。
- 篡改：广告响应 HMAC；更新清单带 minisign，由桌面端 `pubkey` 校验。
- 爆破：同 IP 连续 5 次失败锁 15 分钟；同账号 1 小时内 20 次失败锁 1 小时。
- 建议在 Cloudflare 面板为 `/api/admin/login` 加 WAF Rate Limiting，并用 Cloudflare Access 再包一层 `/admin`。

## 后期迁出 Cloudflare

`src/db/database.ts` 是唯一存储边界。换成 Postgres/MySQL 时实现同一个 `Db` 接口即可。Hono 路由、Zod 契约、管理台均可原样保留，挂到 Node 或其它运行时。
