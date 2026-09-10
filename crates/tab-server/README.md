# TAB 服务

公共 / 自建 Cursor TAB 代理。把 Cursor 的 Connect-RPC 转到 `api2/api3/api4.cursor.sh`，用运营者（或你自己）的 token 替换 `Authorization`，并重算 `x-cursor-checksum`。

桌面端已有三种 TAB 模式，不需要改客户端：

| 模式 | 用法 |
|---|---|
| 公益服务 | 默认打 `https://tab.susuan.ai`（部署本服务后把域名指过去） |
| 自定义 | 填本服务地址，例如 `http://127.0.0.1:8041` |
| 直连 | 不经过本服务，打 Cursor 官方 |

## 配置

复制 [`config.example.toml`](config.example.toml) 为 `config.toml`（可放在仓库根或 `crates/tab-server/`），填入 Cursor `accessToken`。也可设 `TAB_SERVER_CONFIG`。未找到 `config.toml` 时会回退到 crate 内的示例配置，服务能启动，但占位 token 不能真正打通 Cursor 上游。改 token 后约 10 秒热加载，不必重启。相对路径 `data_dir` 按配置文件所在目录解析。

### 如何获取 token

**macOS**

```bash
sqlite3 "$HOME/Library/Application Support/Cursor/User/globalStorage/state.vscdb" \
  "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken';"
```

**Windows**

```powershell
sqlite3 "$env:APPDATA\Cursor\User\globalStorage\state.vscdb" "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken';"
```

## 本地运行

在仓库根目录：

```bash
make dev-tab-server
# 或
cargo run -p tab-server --bin tab-server
```

默认监听 `0.0.0.0:8041`。浏览器打开 `http://127.0.0.1:8041/` 可看「当前被顶次数」。`GET /healthz` 探活。`GET /api/stats` 返回公开 JSON。`GET /status` 需要 `admin_key`（`X-Admin-Key` 或 `Authorization: Bearer …`）。

桌面端 TAB 设置选 **自定义**，地址填 `http://127.0.0.1:8041`。

## Docker

仓库根目录：

```bash
make build-tab-server-docker
cp crates/tab-server/config.example.toml /tmp/tab-data/config.toml
# 编辑 /tmp/tab-data/config.toml 填 token；公共部署开限流，自建可 rate_limit.enabled=false
docker run --rm -p 8041:8041 -v /tmp/tab-data:/data cursor-tools-tab:local
```

`data_dir` 默认写在配置里的 `/data`（容器内），`stats.json` 落在同一卷，重启后计数不丢。

## 请求约定

客户端（本仓库 `server/`）在公益 / 自定义模式会带：

```
X-Cursor-Assistant-Device-ID: <安装 UUID>
```

缺头或不是 UUID → `400`。设备或 IP 超限 → `429` + `Retry-After`。没有健康 token → `503`。

计数口径：`/aiserver.v1.AiService/StreamCpp` 上游返回 2xx 记一次。
