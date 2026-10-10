# 文档

本目录是 cursor-tools 的开发与运维文档入口。面向用户的安装说明在线上[使用帮助](https://ops.susuan.ai/download/guide.html)，不放在这里。

| 文档 | 内容 |
| --- | --- |
| [本文](./README.md) | 仓库总览、线上入口、ops 运维、桌面发版与更新链路 |
| [server-architecture.md](./server-architecture.md) | `server/` 目录结构、主链路与模块边界 |
| [external-apis.md](./external-apis.md) | 出站广告、TAB、模型通道、更新清单等外部接口契约 |
| [ops/README.md](../ops/README.md) | Cloudflare Worker：广告、更新清单、下载页、管理台部署细节 |

当前桌面版本以清单为准（现为 **1.1.0**）。

| 仓库 | 可见性 | 用途 |
| --- | --- | --- |
| `moralmaker/cursor-toosl` | 私有 | 源码、CI、发版工作流 |
| `moralmaker/cursor-tools-releases` | 公开 | 安装包与更新清单（用户与客户端匿名下载） |

---

## 1. 仓库结构

```text
cursor-tools/
├── apps/desktop/          # Tauri 2 桌面壳：React UI + Rust
├── server/                # 本机网关：Agent、SQLite、插件、Cursor 接管
├── crates/
│   ├── semble-core/       # 本地代码索引与搜索
│   └── tab-server/        # 公益 / 自建 Cursor TAB 代理（线上 tab.susuan.ai）
├── protocols/cursor/      # server/build.rs 使用的 Cursor protobuf
├── ops/                   # Cloudflare Worker：广告 + 更新 + 下载页 + 管理台
├── support/               # 协议提取、抓包、搜索基准等工具
├── docs/                  # 本文档目录
├── .github/workflows/     # ci.yml、release.yml
├── Cargo.toml             # Rust workspace
└── Makefile               # dev / check / build 入口
```

主数据流（运行时）：

```text
Cursor IDE
    │  Agent / 工具结果
    ▼
apps/desktop + server/          ← 本机进程；密钥与配置落本地 SQLite
    │
    ├── 用户配置的模型 API
    ├── ops.susuan.ai           ← 广告、更新清单、安装包 CDN（R2）
    ├── tab.susuan.ai           ← 公益 TAB（可选）
    └── GitHub Releases         ← 更新清单回退
```

---

## 2. 线上入口（当前）

| 入口 | URL | 说明 |
| --- | --- | --- |
| 下载页 | https://ops.susuan.ai/download/ | 按设备推荐安装包；根路径 `/` 302 到此处 |
| 使用帮助 | https://ops.susuan.ai/download/guide.html | 安装、接管、FAQ |
| 更新日志 | https://ops.susuan.ai/download/changelog/ | 各版本更新记录；详情 `/download/changelog/{version}/` |
| 运营后台 | https://ops.susuan.ai/admin/ | 广告位、Release 导入、下载统计、审计；`noindex` |
| 更新清单（优先） | https://ops.susuan.ai/api/v1/updates/latest.json | Tauri updater 第一端点 |
| 更新清单（回退） | GitHub `cursor-tools-releases` 的 `latest.json` | ops 不可用时 |
| 便携更新 | https://ops.susuan.ai/api/v1/updates/portable-latest.json | Windows 便携版 |
| 安装包加速 | https://ops.susuan.ai/api/v1/updates/assets/:name | R2 托管，避免直连 GitHub 过慢 |
| 公开 Releases | https://github.com/moralmaker/cursor-tools-releases/releases/latest | 源安装包与清单归档 |
| 公益 TAB | https://tab.susuan.ai | 与 ops 无关，见 `crates/tab-server` |

桌面端 updater 端点顺序见 `apps/desktop/src-tauri/tauri.conf.json`：先 ops，再 GitHub。

---

## 3. ops 服务（广告 / 更新 / 下载 / 管理台）

实现目录：`ops/`。运行时是单个 Cloudflare Worker，自定义域 `ops.susuan.ai`。

```text
ops.susuan.ai
├── /download/                 # 公开落地页 + guide（静态 HTML）
├── /admin/                    # 运营台 SPA（含「下载统计」）
├── /api/v1/ads*               # 桌面端广告
├── /api/v1/updates/*          # latest / portable 清单
├── /api/v1/updates/assets/*   # R2 安装包 / 更新包（200 时计入下载）
├── /api/v1/images/*           # 广告图（内容哈希命名）
└── /api/admin/*               # 登录与管理 API（会话 Cookie）
      └── /download-stats      # 下载日聚合查询
```

下载统计（v1）：仅计 R2 资产 `200`（排除 `.sig` / 清单）；`304` 与直连 GitHub 不计。

存储：

| 绑定 | 资源 | 用途 |
| --- | --- | --- |
| `DB` | D1 `cursor-tools-ops` | 广告位、版本、会话、审计、下载日聚合 |
| `IMAGES` | R2 `cursor-tools-ops-images` | 管理台上传的广告图 |
| `RELEASES` | R2 `cursor-tools-ops-releases` | 桌面更新包与安装包加速 |
| `ASSETS` | Worker Assets `site/` | `/admin`、`/download` 静态站点 |

构建与部署：

```bash
cd ops
npm install
npm run deploy          # build:ui（Vite 管理台 + assemble-site）后 wrangler deploy
```

本地：

```bash
cd ops
cp .dev.vars.example .dev.vars   # 填 ADMIN_PASSWORD_HASH 等
npx wrangler d1 migrations apply cursor-tools-ops --local
npm run dev                      # http://127.0.0.1:8787/admin/ 、/download/
```

接口契约与部署细节见 [ops/README.md](../ops/README.md)；客户端出站字段见 [external-apis.md](./external-apis.md)。

### 3.1 发版后如何让客户端走加速更新

1. GitHub Actions 把安装包发到公开仓库 `cursor-tools-releases`。
2. 登录运营台 → Releases，从 GitHub 导入该版本（或 `POST /api/admin/releases/import-github`）。
3. 导入会把资产 URL 改写为 `https://ops.susuan.ai/api/v1/updates/assets/<文件名>`。文件本身要用 `wrangler r2 object put` 放进 `cursor-tools-ops-releases`，否则加速地址是 404。
4. 已安装客户端优先拉 ops 的 `latest.json`；ops 未导入时仍可回退 GitHub。

只发 GitHub、不导入 ops 时：走 GitHub 回退的客户端仍能更新；走 ops 优先端点的客户端要等导入完成。

### 3.2 修改管理台账号密码

- **用户名**：`ops/wrangler.jsonc` → `vars.ADMIN_USERNAME`，改完后 `npm run deploy`。
- **密码**：本机生成哈希再写入 Cloudflare Secret（不要把明文密码或哈希提交进仓库）。

```bash
cd ops
npm run hash-password
# 输入 ≥8 位密码，得到一行 pbkdf2-sha256$...

# 密钥名必须是 ADMIN_PASSWORD_HASH；出现 Enter a secret value 后再粘贴哈希
# 不要把哈希写在 put 后面的参数里（shell 会把 $ 展开，容易变成错误密钥名）
npx wrangler secret put ADMIN_PASSWORD_HASH
```

本地开发改 `ops/.dev.vars` 里的 `ADMIN_PASSWORD_HASH`，与线上 Secret 互不影响。可选：`ADMIN_TOTP_SECRET` 开 TOTP。

### 3.3 同域说明（下载页 + 后台）

下载页与管理台同域是刻意简化：一套 Worker、一套域名。会话 Cookie 为 `HttpOnly; SameSite=Strict; Secure`，写操作校验同源 `Origin` / `Sec-Fetch-Site` 与 `X-Requested-With`。管理台与下载页使用不同 CSP。

同域的主要代价是：若下载页出现 XSS，可同源调用管理 API。下载页为自维护静态页；进一步加固可给 `/admin` 加 Cloudflare Access，或日后把下载迁到独立子域。当前**不必**为同域拆成两个 Worker。

---

## 4. 桌面端 Releases：改版本号与多端打包

正式多端安装包**只通过 GitHub Actions** 打。推送匹配的 `v*` 标签后，四台 runner 并行出包并发布到公开仓库 Latest Release。本机 `tauri build` 只能打**当前操作系统**，用来自测，不能代替 Releases。

```text
改 4 个版本清单 + 2 个 lock
        │
        ▼
commit 并推到 origin/main          ← 只准备，不发版
        │
        ▼
git tag vX.Y.Z && git push origin vX.Y.Z
        │
        ▼
.github/workflows/release.yml
        │
        ├── prepare     作者、签名密钥、版本=标签、commit 已在 main
        ├── publish ×4  Linux / Windows / macOS arm64 / macOS x64
        └── finalize    latest.json + update.json + portable-latest.json
                        去掉 draft，标为 Latest
        │
        ▼
运营台导入 → R2 加速 URL 写入 ops 清单
        │
        ▼
已安装客户端按清单自动更新（先 ops，后 GitHub）
```

不要用 GitHub 的 Prerelease 开关。测试版把版本写成 `0.1.8-beta.1`，仍然发普通 Latest Release，标题或正文写明 Beta。客户端走 `/releases/latest/download/`，GitHub Prerelease 不会出现在这条路径里。

**同一版本号发布过后不能重发。** 要修包就升一个新号（例如已发 `1.0.0` 则下一版用 `1.0.1`）。

### 4.1 版本号改哪里

桌面端版本必须四处一致，两个 lock 跟着变。**不要**为了发桌面版去改 `server/Cargo.toml` 或 `crates/tab-server/Cargo.toml`。

```text
cursor-tools/
├── Cargo.lock                              # cursor-tools-desktop 的 version
└── apps/desktop/
    ├── package.json                        # "version"
    ├── package-lock.json                   # 根 version 与 packages[""].version
    └── src-tauri/
        ├── Cargo.toml                      # [package].version
        └── tauri.conf.json                 # "version"
```

工作流会核对：

```text
tauri.conf.json == package.json == Cargo.toml == 标签名去掉 v
标签指向的 commit 必须已经在 origin/main 上
```

| 类型 | 清单里的 version | 标签 | 说明 |
| --- | --- | --- | --- |
| 正式版 | `1.1.0` | `v1.1.0` | 标题 `Cursor TOOLS v1.1.0`。深空界面、按模型计价、概览热力图与自定义时间 |
| 测试版 | `1.0.2-beta.1` | `v1.0.2-beta.1` | 仍是普通 Latest Release；正文带 Beta |

Windows 测试版必须走 NSIS（工作流已写死 `--bundles nsis`）。不要用 WiX/MSI 打带 `beta.1` 的版本，MSI 不接受非数字预发布号。

在仓库根目录，把 `NEW_VERSION` 换成目标号后整段执行：

```bash
export NEW_VERSION=1.0.2

npm --prefix apps/desktop version "${NEW_VERSION}" --no-git-tag-version

# Cargo.toml：macOS / BSD 用 -i ''；Linux 改成 -i
sed -i '' "1,6s/^version = \".*\"/version = \"${NEW_VERSION}\"/" apps/desktop/src-tauri/Cargo.toml

python3 - <<'PY'
import json, os
from pathlib import Path
path = Path("apps/desktop/src-tauri/tauri.conf.json")
data = json.loads(path.read_text())
data["version"] = os.environ["NEW_VERSION"]
path.write_text(json.dumps(data, indent=2) + "\n")
PY

cargo update -p cursor-tools-desktop
```

核对四处相同：

```bash
node -p "require('./apps/desktop/package.json').version"
node -p "require('./apps/desktop/src-tauri/tauri.conf.json').version"
sed -n '/^version = / { s/version = "\([^"]*\)"/\1/p; q; }' apps/desktop/src-tauri/Cargo.toml
python3 - <<'PY'
import pathlib, re
text = pathlib.Path("Cargo.lock").read_text()
m = re.search(r'name = "cursor-tools-desktop"\nversion = "([^"]+)"', text)
print(m.group(1) if m else "missing")
PY
```

发版前还要确认这两个 Proto 已提交（`server/build.rs` 构建输入）。`protocols/cursor/` 下其余由提取工具生成的 Proto 已被 `.gitignore` 排除，除非构建开始依赖它们：

```text
protocols/cursor/agent_v1.proto
protocols/cursor/aiserver_v1.proto
```

### 4.2 发版前检查

1. `git fetch origin`，发版 commit 基于当前 `origin/main`，不要夹带无关本地改动。
2. `tauri.conf.json` 里 updater `pubkey` 与仓库 `.tauri/cursor-tools.key.pub` 一致。**不要**打印、提交或上传 `.tauri/cursor-tools.key`。
3. 源码仓库 GitHub Actions Secrets 已有：
   - `TAURI_SIGNING_PRIVATE_KEY`（本地密钥无密码时**不要**配 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`）
   - `RELEASES_REPO_TOKEN`：只授权 `moralmaker/cursor-tools-releases`、Contents: Read and write 的 fine-grained token
4. 目标标签和同名 Release 都不存在：

```bash
git ls-remote --tags origin 'v1.0.2'
gh release view v1.0.2 --repo moralmaker/cursor-tools-releases
```

后者报 `release not found` 才是预期。

5. 本机先跑检查和一次不打安装包的桌面编译：

```bash
make check
npm --prefix apps/desktop run tauri:build -- --debug --no-bundle
```

只有仓库所有者（`github.repository_owner`，现为 `moralmaker`）推标签才会通过 `prepare` 里的作者校验。

### 4.3 本机单端打包（自测，不是 Releases）

本机产物用本地生成的 `.tauri/cursor-tools.local.key` 签名，和 GitHub Secret 里的正式密钥不是一把。装包可以自己点开试，**已安装用户不会从这包自动更新**。

```bash
make build-desktop
```

| 系统 | 实际命令 | 产物大致位置 |
| --- | --- | --- |
| macOS / Linux | `tauri build`（Makefile 已包一层） | `target/release/bundle/` |
| Windows x64 | `tauri build --bundles nsis` | `target/release/bundle/nsis/` |

本机**没有**官方四端矩阵。不要在一台 Mac 上交叉编译 Windows / Linux 安装包来当正式包。Windows ARM64 + SMB 工作区等特殊环境变量见仓库根 [README.md](../README.md) Development 一节。

### 4.4 正式多端打包（GitHub Actions）

触发器只有推送 `v*` 标签。推 `main`、手动 `workflow_dispatch` 都不会发版。

```text
publish
├── linux-x86_64     ubuntu-22.04      默认 bundles（deb / rpm / AppImage 等）
├── windows-x86_64   windows-latest    --bundles nsis
├── macos-aarch64    macos-15          --target aarch64-apple-darwin
└── macos-x86_64     macos-15-intel    --target x86_64-apple-darwin
```

macOS 另读 `apps/desktop/src-tauri/tauri.macos.conf.json`，`targets` 只有 `app`（`.app` + updater 用的 `.app.tar.gz`），不打 dmg。Windows 只打 NSIS（`*-setup.exe`）。Linux 跟随 `tauri.conf.json` 的 `bundle.targets = "all"`。macOS job 把 `APPLE_SIGNING_IDENTITY` 设为 `-`，不做 Apple 开发者签名 / 公证。

`fail-fast: false`：一端失败不会取消另外三端，但 `finalize` 要求四端都成功才会把 draft 改成正式 Latest。

版本号 commit 已在本地且检查通过之后：

```bash
# 1. 只提交版本清单和必要源码，推 main
git add \
  apps/desktop/package.json \
  apps/desktop/package-lock.json \
  apps/desktop/src-tauri/Cargo.toml \
  apps/desktop/src-tauri/tauri.conf.json \
  Cargo.lock
git status          # 确认没有 .tauri/、config.toml、无关改动
git commit -m "Release desktop v1.0.2"
git push origin HEAD:main

# 2. 确认 commit 已在 origin/main
git fetch origin
git merge-base --is-ancestor HEAD origin/main && echo ok

# 3. 打标签并推标签 —— 这一步才触发打包
git tag v1.0.2
git push origin v1.0.2
```

```bash
gh run list --workflow "Release desktop app" --limit 5
gh run watch
```

工作流：`https://github.com/moralmaker/cursor-toosl/actions/workflows/release.yml`

```text
prepare
  ├── GITHUB_ACTOR == 仓库所有者
  ├── Secret TAURI_SIGNING_PRIVATE_KEY、RELEASES_REPO_TOKEN 非空
  ├── 三个清单 version 相同，且标签 == v<version>
  ├── 该 commit 是 origin/main 的祖先
  └── 若 v<version> 已是正式 Release → 整次跳过（不重发）

publish（每端）
  ├── npm ci && tauri-action@v1
  │     在公开仓库 cursor-tools-releases 创建 draft Release
  │     上传该端安装包、.sig、latest.json
  └── 额外打旧客户端更新包到 artifact
        Linux / Windows / macOS arm64 / macOS x64

finalize
  ├── 规范化 latest.json 下载 URL
  ├── 生成 update.json（旧版 v0.0.49 客户端）
  ├── 生成 portable-latest.json（Windows 便携包）
  ├── 上传上述清单和 legacy 包
  └── gh release edit --draft=false --latest
```

中途失败时 Release 可能停在 draft。不要手改标签或覆盖已发布版本；修代码后升号重走全流程。

### 4.5 Release 里应该有哪些文件

产品名：**Cursor TOOLS / cursor-tools-***。安装包文件名以当次 Actions 日志为准。

| 平台 | 典型产物 | 给谁用 |
| --- | --- | --- |
| Windows x64 | `*_x64-setup.exe` 以及对应 `.sig` | 安装版；应用内更新走这份 |
| Linux x64 | `.AppImage` / `.deb` / `.rpm` 以及需要的 `.sig` | 发行版对应格式 |
| macOS Apple Silicon | `.app.tar.gz` 以及 `.sig` | arm64；下载页「下载 MacOS 版本」即此包 |
| macOS Intel | `.app.tar.gz` 以及 `.sig` | x64 |

说明：macOS 用户下载的是 updater 用的 `.app.tar.gz`（解压得到 `.app`），不是单独的 `.dmg` / 裸 `.app` zip。这是 Tauri macOS 更新通道的产物形态。

| 文件 | 用途 |
| --- | --- |
| `latest.json` | 现桌面端 Tauri updater |
| `update.json` | 旧版 `v0.0.49` 客户端 |
| `portable-latest.json` | Windows 便携包更新 |

| 文件 | 平台 |
| --- | --- |
| `cursor-tools-<ver>-macos-arm64.tar.gz` | macOS arm64 |
| `cursor-tools-<ver>-macos-amd64.tar.gz` | macOS x64 |
| `cursor-tools-<ver>-windows-amd64.zip` | Windows 便携 exe |
| `cursor-tools-<ver>-windows-amd64.zip.sig` | 上面 zip 的签名 |
| `cursor-tools-<ver>-linux-amd64.tar.gz` | Linux 可执行文件 |

```bash
gh api repos/moralmaker/cursor-tools-releases/releases/latest \
  --jq '{tag:.tag_name,draft:.draft,prerelease:.prerelease,assets:[.assets[].name]}'
```

确认不是 draft、`prerelease` 为 false、并且是 Latest。

### 4.6 发完之后：客户端怎么更新

```text
已安装桌面端
  ├── 安装版    GET latest.json
  │               优先 ops.susuan.ai/api/v1/updates/latest.json
  │               回退 GitHub .../releases/latest/download/latest.json
  ├── 便携 Windows  GET portable-latest.json（同样先 ops 再按实现回退）
  └── 旧版 v0.0.49  GET update.json
```

更新验的是 `tauri.conf.json` 里的**公钥**，和打包装时用的**私钥**必须是一对。设置页可以看到当前版本和待安装版本。

### 4.7 验收清单

- [ ] 标签 `v<version>` 存在，且指向已在 `origin/main` 上的 commit
- [ ] Release 已发布（非 draft），`prerelease: false`，是 Latest
- [ ] 四端安装包都在 Assets 里，带 updater `.sig`
- [ ] `latest.json`、`update.json`、`portable-latest.json` 都在
- [ ] 四个 `cursor-tools-<ver>-{macos-arm64,macos-amd64,windows-amd64,linux-amd64}` 包都在；Windows zip 有 `.sig`
- [ ] 测试版标题或正文写了 Beta，但 GitHub 仍是普通 Latest
- [ ] 需要走 ops 加速的客户端：已导入该版本，且资产 URL 指向 R2

### 4.8 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 推了 `main` 但 Actions 没打安装包 | 正常。只有推 `v*` 标签才触发 |
| `Release tag must point to a commit contained in origin/main` | 先把发版 commit 推到 `main`，再打标签 |
| `tag ...` 与 version 不一致 | 标签必须是 `v` + 清单 version |
| `Only ... may publish a release` | 不是仓库所有者推的标签 |
| `TAURI_SIGNING_PRIVATE_KEY is not configured` | 在源码仓库 Secrets 写入正式私钥 |
| `RELEASES_REPO_TOKEN` 缺失 / 创建 Release 403 | 写入对 `cursor-tools-releases` 有 Contents 写权限的 token |
| `Version ... is already published; nothing to do` | 该号已发过，升号 |
| 一端红、Release 停在 draft | 看该 matrix job 日志；修好后升号重打 |
| 本机装包能开，应用内提示更新失败 | 本机用的是 `.local.key`，和线上公钥不是一对 |
| 想重发同一个已发布版本 | 不允许。升一个新号再走全流程 |
| 手动把 Release 标成 Prerelease | 客户端拿不到 `/releases/latest`。不要这样做 |
| ops 登录 `invalid credentials` | 确认 Secret 名是 `ADMIN_PASSWORD_HASH`；`put` 时哈希放在交互提示里粘贴，不要当 CLI 参数 |
| 更新很慢 / 超时 | 确认 ops 已导入且资产走 R2 `.../updates/assets/...`，而不是直连 GitHub |

不要删除、替换、移动已经发布的标签或 Release，除非另有明确授权。不要把 `.tauri/cursor-tools.key` 写进仓库或发到聊天里。

---

## 5. 相关文件

```text
.github/workflows/release.yml                 # 发版工作流
.github/scripts/generate-legacy-update.mjs    # update.json
.github/scripts/generate-portable-update.mjs  # portable-latest.json
.github/scripts/normalize-tauri-update.mjs    # 修正 latest.json 下载 URL
apps/desktop/src-tauri/tauri.conf.json        # 版本、安装包、updater 公钥与端点
apps/desktop/src-tauri/tauri.macos.conf.json  # macOS 只打 app
ops/wrangler.jsonc                            # Worker 域名、ADMIN_USERNAME、D1/R2
ops/download/                                 # 公开下载页与使用帮助源码
ops/scripts/assemble-site.mjs                 # 组装 site/admin + site/download
ops/scripts/hash-password.mjs                 # 生成 ADMIN_PASSWORD_HASH
Makefile                                      # 本机 build-desktop / check / dev-*
```
