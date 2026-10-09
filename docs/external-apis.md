# 外部接口开发手册

本文只覆盖 **本进程主动访问的外部 HTTP(S) 接口**，用于自建兼容服务或对接上游。  
本机控制面 `/__tools-api__/api/*`、Cursor IDE 打到本机代理的请求，都不是外部接口。

当前默认出站基址：广告与桌面更新清单走 `https://ops.susuan.ai`（本仓库 `ops/`，Cloudflare Worker）；公益 TAB 走 `https://tab.susuan.ai`（本仓库 `crates/tab-server/`）。  
本地调试广告：`http://127.0.0.1:8787/api/v1/ads?placement=menu`（`ops/` 的 `wrangler dev`）。  
本地调试 TAB：`http://127.0.0.1:8041`（`crates/tab-server`，桌面端选自定义）。

---

## 范围

```
本机 UI / Cursor IDE
        │
        ▼
server/  本地管理服务 + Cursor 代理          ← 入站，不是外部接口
        │
        ├── ops.susuan.ai                    ← 广告 + 桌面更新清单（ops/）
        ├── tab.susuan.ai                    ← 公益 TAB（crates/tab-server/），可自建兼容
        ├── 用户填写的模型 / 代理 / 自定义 TAB
        ├── api2.cursor.sh（及 *.cursor.sh）
        ├── 内置插件官方主机（Google / OpenAI / xAI）
        ├── 内置搜索引擎 + 任意公网网页
        └── GitHub Releases（更新清单回退、Deno zip）
```

桌面 WebView 的 `connect-src` 只允许本机。广告、模型、搜索都由 Rust 服务出站。  
例外：Tauri 原生更新器先拉 `ops.susuan.ai` 的清单，失败再回退 GitHub `latest.json`。

---

## 出站接口总览

```
outbound/
├── first-party/                         # 本项目定义契约，优先按本文实现
│   ├── ads                              # GET/POST ops.susuan.ai/api/v1/ads*
│   ├── tab-public                       # 透传 Cursor Connect-RPC 到 tab.susuan.ai（crates/tab-server）
│   └── updates                          # ops.susuan.ai/api/v1/updates/* ，GitHub 为回退
├── user-configured/                     # URL 由用户配置，形状由本项目发出
│   ├── openai-chat                      # POST …/v1/chat/completions  SSE
│   ├── openai-responses                 # POST …/v1/responses  SSE
│   ├── anthropic                        # POST …/v1/messages  SSE
│   ├── model-discovery                  # GET …/models
│   └── outbound-http-proxy              # 用户自定义代理，不是业务 API
├── cursor-official/                     # 透传，body 是 Cursor protobuf / Stripe JSON
│   ├── api2.cursor.sh                   # 默认上游
│   └── *.cursor.sh                      # 仅当请求带 x-server-upstream-url
├── plugins/                             # 内置插件，主机必须写在 plugin.json
│   ├── antigravity-auth                 # Google OAuth + Cloud Code
│   ├── codex-auth                       # OpenAI device OAuth + ChatGPT Codex
│   └── grok-auth                        # xAI device OAuth + Grok
└── search-fetch/                        # 内置引擎目录 + 任意 https 网页
    ├── catalog.rs                       # 23 个搜索源
    └── fetch.rs                         # GET 任意公网 URL，抽成 Markdown
```

---

## 1. 广告服务（可自建）

实现位置：`server/src/control/ads.rs`、`server/src/control/service.rs`；兼容服务在本仓库 `ops/`。  
前端只打本机 `/__tools-api__/api/promotions`，再由服务转发。

当前仓库有本地开关 `ADS_DISABLED_LOCALLY`。为 `true` 时 **不访问外部广告接口**，直接返回空 `slots`。

### 1.1 拉取广告

```
GET {origin}/api/v1/ads?placement=menu
```

默认 `{origin}` = `https://ops.susuan.ai`。  
本项目 **只认** `placement=menu`。其它 placement 会被客户端丢掉。

**请求头**

| 头 | 必填 | 值 |
|---|---|---|
| `X-Cursor-Assistant-Device-ID` | 是 | 本机安装 UUID，随机生成，不是账号 |
| `X-Cursor-Assistant-OS` | 是 | `macos` / `linux` / `windows` |
| `X-Cursor-Assistant-Version` | 是 | 桌面应用版本，如 `0.1.7` |
| `accept-language` | 是 | 只区分 `zh-CN` 与其它（其它当 `en-US`） |
| `disable-ad-ids` | 否 | 用户已关闭的广告 id，逗号分隔 |

无请求体。超时 60s。非 2xx 视为失败，错误正文最多取 200 字符。

**成功响应** `application/json`

```json
{
  "slots": [
    {
      "id": "ad-001",
      "enabled": true,
      "placement": "menu",
      "target": {
        "title": "菜单上看到的短标题",
        "description": "菜单上看到的短描述",
        "imageUrl": "https://cdn.example.com/icon.png"
      },
      "content": {
        "title": "弹层标题",
        "description": "弹层描述",
        "imageUrl": "https://cdn.example.com/banner.png",
        "details": [
          { "label": "价格", "value": "免费" }
        ],
        "button": {
          "label": "打开",
          "action": {
            "type": "open_browser",
            "url": "https://example.com/landing"
          }
        }
      }
    }
  ]
}
```

字段约束（反序列化后还会再校验）：

| 字段 | 规则 |
|---|---|
| JSON 键 | **camelCase**（Rust `#[serde(rename_all = "camelCase")]`） |
| `placement` | 只能是 `"menu"` |
| `enabled` | `false` 的 slot 会被丢掉 |
| `target.imageUrl` / `content.imageUrl` / `content.button.action.url` | 必须是带 host 的 `http` 或 `https` 绝对地址 |
| `action.type` | 只能是 `"open_browser"`（snake_case） |
| `details` | 可空数组 |
| `dismissible` | 可省略，默认 `true`。`false` 时客户端不显示关闭按钮，并忽略该 slot 以前的本地关闭记录；ops 也不再按 `disable-ad-ids` 过滤它 |
| `content.button` | 可省略；省略时弹层不显示按钮。出现时 `label` 与 `action` 都必填。1.0.0 及更早客户端要求必填，ops 会对这些版本过滤掉无按钮的 slot |

客户端随后会对两个 `imageUrl` 再发 `GET`（超时 10s），只接受：

- `image/png` → `.png`
- `image/jpeg` → `.jpg`
- `image/gif` → `.gif`
- `image/webp` → `.webp`
- `image/avif` → `.avif`

单图上限 10 MiB。下载成功后改写为本机 `/__tools-api__/api/promotions/images/{sha256}.{ext}`。图片下载失败 **不导致整次广告失败**。

兼容服务最低实现：返回 `{"slots":[]}` 即静默无广告。

### 1.2 关闭广告

```
POST {origin}/api/v1/ads/{ad_id}/dismissals
```

路径算法：去掉查询串，在 `/api/v1/ads` 后追加 `{ad_id}/dismissals`。  
例如：`https://ops.susuan.ai/api/v1/ads/ad-001/dismissals`。

**请求头**：同上设备 / OS / 版本（无 `accept-language`、无 `disable-ad-ids`）。  
**请求体**

```json
{ "reason": "用户在弹层里填写的关闭原因，任意非空字符串" }
```

超时 5s。任意 2xx 即可，响应体忽略。本机对前端返回 `204`。

---

## 2. 公益 / 自定义 TAB 服务（可自建）

实现位置：`server/src/cursor/services/tab.rs`、`server/src/api/cursor/proxy.rs`；兼容服务在本仓库 [`crates/tab-server`](../crates/tab-server/README.md)。

TAB 模式：

| 模式 | 上游 |
|---|---|
| `public` | 固定 `https://tab.susuan.ai` |
| `custom` | 用户填写的地址（设置页 placeholder 同域；自建本服务即填此处） |
| `direct` | 不走公益服务，改打 Cursor 官方 `https://api2.cursor.sh` |

本项目 **不解析、不改写** TAB 的 protobuf。兼容服务必须实现与 Cursor 官方相同的 Connect-RPC：

- 方法：`POST`
- 路径：原样拼接 `{service_url}{path}`，`service_url` 去尾斜杠
- 头：透传 Cursor 请求头（去掉 `Host`、`x-server-upstream-url`、hop-by-hop）；公益 / 自定义模式额外带 `X-Cursor-Assistant-Device-ID`（本机安装 UUID）
- 体：原样字节流
- 响应：原样状态码 / 头 / 体回给 Cursor

`crates/tab-server` 对入站的语义：

| 情况 | 状态 |
|---|---|
| 缺 Device-ID / 不是 UUID | `400` |
| 设备或 IP 超限（可关） | `429` + `Retry-After` |
| 没有健康 token | `503` |
| 上游失败 | `502` |

公开页面：`GET /`（当前被顶次数）、`GET /api/stats`、`GET /healthz`。`StreamCpp` 上游 2xx 记一次。

必须实现的路径（全部 POST）：

```
/aiserver.v1.AiService/StreamCpp
/aiserver.v1.AiService/StreamNextCursorPrediction
/aiserver.v1.AiService/GetCppEditClassification
/aiserver.v1.AiService/RefreshTabContext
/aiserver.v1.AiService/CppConfig
/aiserver.v1.AiService/CppEditHistoryStatus
/aiserver.v1.AiService/CppAppend
/aiserver.v1.AiService/CppEditHistoryAppend
/aiserver.v1.AiService/ReportAiCodeChangeMetrics
/aiserver.v1.AiService/WriteGitBranchName
/aiserver.v1.CppService/AvailableModels
/aiserver.v1.CppService/RecordCppFate
/aiserver.v1.FileSyncService/FSSyncFile
/aiserver.v1.FileSyncService/FSIsEnabledForUser
/aiserver.v1.FileSyncService/FSConfig
/aiserver.v1.FileSyncService/FSUploadFile
```

消息定义见 `protocols/cursor/aiserver_v1.proto`。不要另造 JSON。

另外：Commit 设置为「直连」时，`/aiserver.v1.AiService/WriteGitCommitMessage` 也会按 TAB 模式转发到同一 `service_url` 或官方上游。本地模型生成提交信息时不走这条外部接口。

---

## 3. 桌面更新清单（本项目发布，客户端消费）

实现位置：`apps/desktop/src-tauri/tauri.conf.json`、`apps/desktop/src-tauri/src/update/mod.rs`、`.github/scripts/`、`ops/`。  
运营服务优先：`https://ops.susuan.ai/api/v1/updates/latest.json`。GitHub Releases 资产仍由发布流水线生成，作为 updater 第二个回退端点。

### 3.1 安装包更新（全平台 Tauri updater）

```
GET https://ops.susuan.ai/api/v1/updates/latest.json
GET https://github.com/moralmaker/cursor-tools-releases/releases/latest/download/latest.json
```

无鉴权。发布流水线生成，形状为 Tauri updater manifest：

```json
{
  "version": "0.1.7",
  "notes": "Cursor TOOLS v0.1.7",
  "pub_date": "2026-01-01T00:00:00.000Z",
  "platforms": {
    "<tauri-platform-key>": {
      "signature": "<minisign 签名原文>",
      "url": "https://github.com/moralmaker/cursor-tools-releases/releases/download/v0.1.7/<asset>"
    }
  }
}
```

`platforms` 的 key / asset 名由 Tauri 打包产物决定。签名公钥在 `tauri.conf.json` 的 `plugins.updater.pubkey`。

### 3.2 Windows 便携包

```
GET https://ops.susuan.ai/api/v1/updates/portable-latest.json
```

```json
{
  "version": "0.1.7",
  "notes": "Cursor TOOLS v0.1.7",
  "pub_date": "2026-01-01T00:00:00.000Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<签名>",
      "url": "https://github.com/moralmaker/cursor-tools-releases/releases/download/v0.1.7/cursor-tools-desktop.exe"
    }
  }
}
```

客户端只读 `version` 判断是否有更新，再按 `platforms.windows-x86_64.url` 下载。

### 3.3 旧版跨平台清单（发布脚本另产，当前桌面端主路径不用）

`.github/scripts/generate-legacy-update.mjs` 还会生成：

```json
{
  "version": "0.1.7",
  "release_date": "2026-01-01T00:00:00.000Z",
  "release_notes": "Cursor TOOLS v0.1.7",
  "platforms": {
    "macos-arm64": {
      "url": "https://github.com/<repo>/releases/download/v0.1.7/cursor-tools-0.1.7-macos-arm64.tar.gz",
      "size": 123,
      "checksum": "sha256:<hex>"
    }
  },
  "mandatory": false
}
```

平台键：`macos-arm64`、`macos-amd64`、`windows-amd64`、`linux-amd64`。

---

## 4. 用户配置的模型提供商

URL / Key 由设置页写入。本项目按协议拼请求。连通性测试与正式对话用同一套 adapter。

推理强度允许值：`low` | `medium` | `high` | `xhigh` | `max`。  
上游若不认 `max`，会 400（例如只接受 `xhigh/high/medium/low`）。此时把模型的推理强度改成上游支持的值。

`use_full_url = false` 时会把 `openai_endpoint`（默认 `/v1/chat/completions`）拼到 `base_url` 后面。`base_url` 不要再带一遍同一路径，否则出现 `/v1/chat/completions/v1/chat/completions`。

### 4.1 OpenAI Chat Completions

**请求**

```
POST {resolved_url}
Authorization: Bearer {api_key}
Content-Type: application/json
+ 用户自定义头
```

**请求体（本项目发出）**

```json
{
  "model": "用户配置的 model_id",
  "messages": [
    { "role": "system", "content": "编译后的 instructions，可空则省略这条" },
    { "role": "user|assistant|tool", "content": "..." }
  ],
  "stream": true,
  "stream_options": { "include_usage": true },
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "tool_name",
        "description": "...",
        "parameters": {}
      }
    }
  ],
  "max_completion_tokens": 4096,
  "reasoning_effort": "high",
  "service_tier": "fast",
  "prompt_cache_key": "按模型 id 生成，用于前缀缓存"
}
```

条件字段：

- `tools`：本轮有工具才带
- `max_completion_tokens`：配置了上限才带
- `reasoning_effort`：配置了才带，字符串原样发出
- `service_tier`：仅延迟档为 Fast 时带 `"fast"`
- 用户 `extra_params` 会 merge 进同一 JSON
- 插件可设 `allowed_body_fields` 白名单裁剪字段

**期望响应**：`text/event-stream`。每条 `data:` 为 JSON，最后 `data: [DONE]`。

本项目读取：

```json
{
  "choices": [
    {
      "delta": {
        "content": "文本增量",
        "reasoning_content": "思考增量，或 reasoning",
        "tool_calls": [
          {
            "index": 0,
            "id": "call_xxx",
            "function": { "name": "foo", "arguments": "{\"a\":1}" }
          }
        ]
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1,
    "completion_tokens": 1,
    "total_tokens": 2
  },
  "error": { "message": "失败时" }
}
```

非流式 JSON 错误：`{ "error": { "message": "..." } }` 或顶层 `message`。

### 4.2 OpenAI Responses

```
POST {resolved_url}          // 默认端点 /v1/responses
Authorization: Bearer {api_key}
Content-Type: application/json
```

```json
{
  "model": "model_id",
  "input": [ ],
  "stream": true,
  "instructions": "system prompt",
  "include": ["reasoning.encrypted_content"],
  "tools": [
    {
      "type": "function",
      "name": "tool_name",
      "description": "...",
      "parameters": {},
      "strict": false
    }
  ],
  "max_output_tokens": 4096,
  "reasoning": { "summary": "auto", "effort": "high" },
  "service_tier": "fast"
}
```

`reasoning` 在「思考开启」或配置了 effort 时带上。响应按 OpenAI Responses SSE 事件解析（`response.output_text.delta`、function call 等）。

### 4.3 Anthropic Messages

```
POST {resolved_url}          // 默认 /v1/messages
x-api-key: {api_key}
anthropic-version: 2023-06-01
Content-Type: application/json
```

```json
{
  "model": "model_id",
  "system": [
    {
      "type": "text",
      "text": "instructions",
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "messages": [ ],
  "max_tokens": 16384,
  "stream": true,
  "tools": [
    {
      "name": "tool_name",
      "description": "...",
      "input_schema": {},
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "thinking": { "type": "adaptive", "display": "summarized" },
  "output_config": { "effort": "high" }
}
```

`thinking` 仅思考开启时带。`output_config.effort` 仅配置了推理强度时带。最后一个 tool 会加 `cache_control`。

响应：Anthropic SSE（`message_start` / `content_block_delta` / `message_delta` / `message_stop`）。

### 4.4 模型列表发现

本机 `POST /__tools-api__/api/models/discover` 会按 `base_url` 推一条或两条外部 GET。

推路径规则（`server/src/control/service.rs`）：

| `base_url` 路径结尾 | 发现 URL |
|---|---|
| `/chat/completions` | 换成 `/models` |
| `/responses` `/messages` `/completions` | 换成 `/models` |
| 已是 `/model` 或 `/models` | 原样 |
| 最后一段是 `v` + 数字（`/v1`、`/api/paas/v4`） | 追加 `/models` |
| 其它 | 先试 `{path}/v1/models`，失败再试 `{path}/models` |

**OpenAI 系**

```
GET {discovery_url}
Authorization: Bearer {api_key}    // key 为空则不带
```

读 `data[]`，每项 `id` 或 `name`，或字符串本身。也接受根就是数组。

**Anthropic 系**

```
GET {discovery_url}?limit=100&after_id={optional}
x-api-key: {api_key}
anthropic-version: 2023-06-01
```

读 `data[]`，`has_more == true` 时用 `last_id` 翻页。

插件模型不走这条，由各插件自己发现。

---

## 5. Cursor 官方上游（透传）

默认：`https://api2.cursor.sh` + 原 path。  
若请求带 `x-server-upstream-url`，且为 `https` 且 host 是 `api2.cursor.sh` / `api3.cursor.sh` / `*.cursor.sh`，则改打该 URL。

未在本机实现的 Cursor 路径一律 fallback 转发。本机会本地应答的（不必然出站）包括模型列表、部分账号/额度、知识库、部分 Dashboard、Statsig bootstrap、连通探测等。

仍会出站的典型路径：

| 路径 | 用途 | 体 |
|---|---|---|
| TAB 16 条（`direct` 模式） | 补全 / 文件同步 | Cursor protobuf |
| `/auth/stripe_profile`、`/auth/full_stripe_profile` | 订阅档 | JSON，读 `membershipType`；本地 token 或已确认 Free 则不打上游 |
| 其它未实现 RPC | 原样转发 | 原样 |

转发不改 body。自建「假官方」没有意义；要对齐只能实现 Cursor 协议。

---

## 6. 内置插件官方接口

插件出站必须 HTTPS、无 URL 用户名密码，且 host 在 `plugin.json` 的 `permissions.network` 里。  
插件 `network.fetch` 的宿主返回：`{ "status": 200, "headers": {}, "body": "文本" }`。

### 6.1 Google Antigravity

`server/plugins/build-in/antigravity-auth/`  
允许主机：`oauth2.googleapis.com`、`www.googleapis.com`、`cloudcode-pa.googleapis.com`、`daily-cloudcode-pa.googleapis.com`、`daily-cloudcode-pa.sandbox.googleapis.com`。

授权页 `https://accounts.google.com/o/oauth2/v2/auth` 只拼给浏览器打开，不经插件 fetch。Client id/secret 见 `google_oauth.ts`。

#### OAuth 换票

```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded
```

授权码：

```
client_id=...
client_secret=...
code=...
code_verifier=...
grant_type=authorization_code
redirect_uri=...
```

刷新：

```
client_id=...
client_secret=...
grant_type=refresh_token
refresh_token=...
```

读：`access_token`、`refresh_token`、`expires_in`、`email`。失败读 `error` / `error_description`。

#### 用户信息

```
GET https://www.googleapis.com/oauth2/v1/userinfo?alt=json
Authorization: Bearer {access_token}
```

读 `email`。失败可忽略。

#### Cloud Code（按 prod → daily → sandbox 依次试）

公共头：

```
Authorization: Bearer {access_token}
Content-Type: application/json
User-Agent: Antigravity/4.3.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/132.0.6834.160 Electron/39.2.3
x-client-name: antigravity
x-client-version: 4.3.0
```

**项目 / 档位**

```
POST {endpoint}/v1internal:loadCodeAssist
{ "metadata": { "ideType": "ANTIGRAVITY" } }
```

读：`cloudaicompanionProject`；`paidTier` / `currentTier` 的 `name` 或 `id`（含 ultra → ULTRA，含 pro/premium/advanced → PRO，否则 FREE）。失败回退项目 `bamboo-precept-lgxtn`。

**模型与额度**

```
POST {endpoint}/v1internal:fetchAvailableModels
{ "project": "{projectId}" }
```

读 `models` 对象：键是 model id，值含 `displayName`、`supportsThinking`、`supportsImages`、`maxOutputTokens`、`quotaInfo.remainingFraction`、`quotaInfo.resetTime`。  
`chat_20706` / `chat_23310` 会被丢掉。额度按 key 是否含 claude/sonnet/opus 或 gemini/flash/pro 归类。

**对话（SSE）**

```
POST {endpoint}/v1internal:streamGenerateContent?alt=sse
Accept: text/event-stream
```

Claude 模型额外带：

```
anthropic-beta: claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14
```

```json
{
  "project": "bamboo-precept-lgxtn",
  "model": "gemini-3.7-flash",
  "userAgent": "antigravity",
  "requestType": "agent",
  "requestId": "{uuid}",
  "enabledCreditTypes": ["GOOGLE_ONE_AI"],
  "request": {
    "contents": [ ],
    "systemInstruction": { },
    "tools": [ ],
    "toolConfig": { "functionCallingConfig": { "mode": "AUTO" } },
    "generationConfig": { "maxOutputTokens": 65536 }
  }
}
```

SSE `data:` JSON。内容在 `response` 或根上：`candidates[0].content.parts[]`（`text` / `thought` / `functionCall` / `thoughtSignature`），用量在 `usageMetadata`（`promptTokenCount`、`candidatesTokenCount`、`totalTokenCount`、`cachedContentTokenCount`）。  
502/503/504/404 换下一个 endpoint。

### 6.2 OpenAI Codex / ChatGPT

`server/plugins/build-in/codex-auth/`  
允许主机：`auth.openai.com`、`chatgpt.com`。  
`client_id`：`app_EMoamEEZ73f0CkXaXp7hrann`。

#### 设备码

```
POST https://auth.openai.com/api/accounts/deviceauth/usercode
Content-Type: application/json
{ "client_id": "app_EMoamEEZ73f0CkXaXp7hrann" }
```

读：`device_auth_id` 或 `device_code`；`user_code` 或 `usercode`；`expires_in`（默认 900）；`interval`（默认 5 秒）。  
用户打开 `https://auth.openai.com/codex/device`。

#### 轮询设备授权

```
POST https://auth.openai.com/api/accounts/deviceauth/token
{ "device_auth_id": "...", "user_code": "..." }
```

- HTTP 403/404 → 仍等待
- body `error` 为 `authorization_pending` / `pending` / `waiting` / `in_progress` → 等待
- `slow_down` → 降频
- `expired_token` / `expired` → 失败
- `access_denied` / `denied` → 拒绝
- 直接给 `access_token` / `refresh_token` → 完成
- 或给 `authorization_code` + `code_verifier`，再换票

#### 授权码换票

```
POST https://auth.openai.com/oauth/token
Content-Type: application/x-www-form-urlencoded
```

```
grant_type=authorization_code
code=...
redirect_uri=https://auth.openai.com/deviceauth/callback
client_id=app_EMoamEEZ73f0CkXaXp7hrann
code_verifier=...
```

读 `access_token`、`refresh_token`。

#### 模型列表

```
GET https://chatgpt.com/backend-api/codex/models?client_version=1.0.0
Authorization: Bearer {access_token}
originator: codex_cli_rs
ChatGPT-Account-Id: {jwt 里的 chatgpt_account_id，有则带}
```

读 `models` 或 `data` 数组。跳过 `supported_in_api === false`、`visibility === hidden`。id 取 `slug` / `id` / `model` / `name`。推理档位取 `supported_reasoning_levels` 等若干别名。

#### 对话

```
POST https://chatgpt.com/backend-api/codex/responses
Authorization: Bearer {access_token}
originator: codex_cli_rs
ChatGPT-Account-Id: ...
session-id / thread-id / x-client-request-id: {同一 cache key}
```

Body 走本项目的 OpenAI Responses 形状（见 4.2）。三者同源，缺头会打到随机分片。

#### 用量

```
GET https://chatgpt.com/backend-api/wham/usage
```

读：

```json
{
  "plan_type": "plus",
  "rate_limit": {
    "primary_window": { "used_percent": 10, "reset_at": 1710000000 },
    "secondary_window": { "used_percent": 20, "reset_at": 1710000000 },
    "limit_reached": false
  },
  "rate_limit_reset_credits": { "available_count": 1 }
}
```

`secondary_window` 当周额度，`primary_window` 当 5 小时窗口。也接受 camelCase。`reset_at` 小于 `10_000_000_000` 时按秒，否则按毫秒。

#### 重置卡

```
GET https://chatgpt.com/backend-api/wham/rate-limit-reset-credits
POST https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume
{ "credit_id": "...", "redeem_request_id": "{uuid}" }
```

### 6.3 xAI Grok

`server/plugins/build-in/grok-auth/`  
允许主机：`auth.x.ai`、`api.x.ai`、`cli-chat-proxy.grok.com`。  
`client_id`：`b1a00492-073a-47ea-816f-4c329264a828`。  
scope：`openid profile email offline_access grok-cli:access api:access`。

#### 设备码

```
POST https://auth.x.ai/oauth2/device/code
Content-Type: application/x-www-form-urlencoded
client_id=...&scope=...
```

读：`device_code`、`user_code`、`verification_uri`、可选 `verification_uri_complete`、`expires_in`、`interval`。

#### 换票 / 轮询

```
POST https://auth.x.ai/oauth2/token
grant_type=urn:ietf:params:oauth:grant-type:device_code
client_id=...
device_code=...
```

2xx 读 `access_token`、`refresh_token`。  
错误码：`authorization_pending`、`slow_down`、`expired_token`、`access_denied`。

#### 模型列表

```
GET https://api.x.ai/v1/language-models
Authorization: Bearer {access_token}
```

失败再：

```
GET https://api.x.ai/v1/models
```

读 `models` 或 `data`。id 取 `id` / `name`。`input_modalities` 含 `image` 或缺失则认为支持图片。  
403 spending-limit 时退回内置 `grok-4.6` / `grok-4.5`。

#### 对话

```
POST https://api.x.ai/v1/chat/completions
Authorization: Bearer {access_token}
```

OpenAI Chat 形状，但 **去掉** `reasoning_effort` 与 `service_tier`（xAI 不接受）。

#### 积分

```
GET https://cli-chat-proxy.grok.com/v1/billing?format=credits
Authorization: Bearer {access_token}
```

读 `config`（或根）：

| 字段 | 含义 |
|---|---|
| `creditUsagePercent` | 已用百分比 |
| `onDemandUsed` / `onDemandCap` | 无百分比时用来算已用 |
| `subscriptionTierDisplay` / `subscriptionTier` / `product` | 套餐名 |
| `currentPeriod.end` / `billingPeriodEnd` | 重置时间 |

401/403 视为授权失效。

---

## 7. 搜索与网页抓取

实现位置：`server/src/search/`。  
Agent 工具触发，不是设置页固定调用。超时：搜索 12s，抓取 30s。  
UA：`Mozilla/5.0 (compatible; CursorTOOLS/0.1; +https://github.com)`。

### 7.1 搜索

全部 `GET`，`{query}` 做 URL 编码替换。每源最多取 10 条。

**HTML 源**（解析选择器见 `catalog.rs`）

| id | URL |
|---|---|
| google | `https://www.google.com/search?q={query}&num=10` |
| bing | `https://www.bing.com/search?q={query}&count=10` |
| brave | `https://search.brave.com/search?q={query}&source=web` |
| duckduckgo | `https://html.duckduckgo.com/html/?q={query}` |
| startpage | `https://www.startpage.com/sp/search?query={query}` |
| yahoo | `https://search.yahoo.com/search?p={query}` |
| mojeek | `https://www.mojeek.com/search?q={query}` |
| qwant | `https://www.qwant.com/?q={query}&t=web` |
| ecosia | `https://www.ecosia.org/search?q={query}` |
| yandex | `https://yandex.com/search/?text={query}` |
| baidu | `https://www.baidu.com/s?wd={query}` |
| sogou | `https://www.sogou.com/web?query={query}` |
| so360 | `https://www.so.com/s?q={query}` |
| naver | `https://search.naver.com/search.naver?query={query}` |
| seznam | `https://search.seznam.cz/?q={query}` |
| github | `https://github.com/search?q={query}&type=repositories` |
| pypi | `https://pypi.org/search/?q={query}` |
| arxiv | `https://arxiv.org/search/?query={query}&searchtype=all` |

**JSON 源**

| id | URL | 数组指针 | 标题 | 链接 | 摘要 | 链接模板 |
|---|---|---|---|---|---|---|
| wikipedia | `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}&srlimit=10&format=json` | `/query/search` | `/title` | `/pageid` | `/snippet` | `https://en.wikipedia.org/?curid={value}` |
| stackoverflow | `https://api.stackexchange.com/2.3/search/advanced?site=stackoverflow&q={query}&pagesize=10&filter=withbody` | `/items` | `/title` | `/link` | `/body` | — |
| crates_io | `https://crates.io/api/v1/crates?q={query}&per_page=10` | `/crates` | `/name` | `/id` | `/description` | `https://crates.io/crates/{value}` |
| npm | `https://registry.npmjs.org/-/v1/search?text={query}&size=10` | `/objects` | `/package/name` | `/package/links/npm` | `/package/description` | — |
| crossref | `https://api.crossref.org/works?query={query}&rows=10` | `/message/items` | `/title/0` | `/URL` | `/abstract` | — |

内部归一成 `{ title, url, chunk, engines[] }`，不把原始 HTML/JSON 回给模型。

### 7.2 抓取

```
GET {任意用户/模型给出的 http(s) URL}
User-Agent: Mozilla/5.0 (compatible; CursorTOOLS/0.1; +https://github.com)
Accept: text/markdown, text/plain;q=0.9, text/html;q=0.8, ...
Accept-Language: en-US,en;q=0.9
```

限制：最多 5 次重定向；正文 ≤ 5 MiB；DNS 不能落到非公网地址。  
按 `Content-Type` 转成 Markdown（HTML 用 readability）。这是通用抓取，没有固定响应 schema。

---

## 8. Deno 运行时下载

首次启用插件时：

```
GET https://github.com/denoland/deno/releases/download/v2.9.6/deno-{target}.zip
```

`target` 与校验 sha256 见 `server/src/plugin/asset.rs`。超时 10 分钟，zip ≤ 128 MiB，必须匹配钉死的 sha256。不是业务 API。

---

## 9. 出站代理（不是业务接口）

设置里的自定义 HTTP 代理会套在 **默认客户端、Cursor 客户端、模型客户端** 上。  
广告、TAB、插件、搜索、模型发现都走这套客户端（Cursor 客户端禁止重定向）。  
不要把代理地址当成业务 API。

---

## 开发优先级

若目标是「做出能被本项目打通的服务」，按这个顺序：

1. **广告** — 契约完全由本仓库定义，JSON，最容易对齐。先实现 `GET /api/v1/ads?placement=menu` 返回合法 `slots`，再补 dismissals。
2. **公益 TAB** — 本仓库 `crates/tab-server` 已实现第 2 节路径的透传代理。自建部署同一镜像，客户端走 `custom`。
3. **模型网关** — 实现 4.1 / 4.2 / 4.3 之一的 SSE。注意 URL 拼接和 `reasoning_effort` 枚举。
4. **更新清单** — 只在发 GitHub Release 时需要，形状见第 3 节。

不要实现本机 `/__tools-api__` 的「外部版」：那是桌面 UI 专用，不会被 Cursor IDE 或外部调用。

---

## 刻意不包含

- npm / crates.io / Cargo 镜像：构建期依赖，不是运行时业务接口
- 设置页预设的 `api.openai.com`、`api.anthropic.com`、`open.bigmodel.cn` 等：只是默认填写，仍走第 4 节
- 前端 demo mock（`apps/desktop/src/demo/api.ts`）：不发起真实外网请求
- Statsig bootstrap：本机本地应答，不出站
