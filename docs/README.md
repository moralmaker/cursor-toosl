# 文档


| 文档                                                 | 内容                                |
| -------------------------------------------------- | --------------------------------- |
| [本文](./README.md)                                  | 桌面端改版本号、本机打包、GitHub Releases 多端发版 |
| [server-architecture.md](./server-architecture.md) | `server/` 目录结构、主链路与模块依赖           |
| [external-apis.md](./external-apis.md)             | 出站广告、TAB、模型通道等外部接口                |


当前桌面版本以清单为准（现为 `1.0.0`）。源码仓库 `moralmaker/cursor-toosl` 是私有的；Release（安装包和更新清单）发到公开仓库 `moralmaker/cursor-tools-releases`，客户端和用户都从那里匿名下载。

---

# 桌面端 Releases：改版本号与多端打包

正式多端安装包**只通过 GitHub Actions** 打。推送匹配的 `v`* 标签后，四台 runner 并行出包并发布 Latest Release。本机 `tauri build` 只能打**当前操作系统**，用来自测，不能代替 Releases。

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
已安装客户端按清单自动更新
```

不要用 GitHub 的 Prerelease 开关。测试版把版本写成 `0.1.8-beta.1`，仍然发普通 Latest Release，标题或正文写明 Beta。客户端走 `/releases/latest/download/`，GitHub Prerelease 不会出现在这条路径里。

---



## 1. 版本号改哪里

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

标签格式：


| 类型  | 清单里的 version   | 标签              | 说明                            |
| --- | -------------- | --------------- | ----------------------------- |
| 正式版 | `0.1.8`        | `v0.1.8`        | 标题 `Cursor TOOLS v0.1.8`      |
| 测试版 | `0.1.8-beta.1` | `v0.1.8-beta.1` | 仍是普通 Latest Release；正文会带 Beta |


Windows 测试版必须走 NSIS（工作流已写死 `--bundles nsis`）。不要用 WiX/MSI 打带 `beta.1` 的版本，MSI 不接受非数字预发布号。

同一版本号发布过后不能重发。要修包就升一个新号。

### 1.1 改版本号的命令

在仓库根目录，把 `0.1.8` 换成目标号后整段执行：

```bash
export NEW_VERSION=1.0.0

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



### 1.2 发版前还要确认的源码

这两个 Proto 是 `server/build.rs` 的构建输入，必须已提交。`protocols/cursor/` 下其余由提取工具生成的 Proto 已被 `.gitignore` 排除，除非构建开始依赖它们：

```text
protocols/cursor/agent_v1.proto
protocols/cursor/aiserver_v1.proto
```

---



## 2. 发版前检查

1. `git fetch origin`，发版 commit 基于当前 `origin/main`，不要夹带无关本地改动。
2. `tauri.conf.json` 里 updater `pubkey` 与仓库 `.tauri/cursor-tools.key.pub` 一致。**不要**打印、提交或上传 `.tauri/cursor-tools.key`。
3. GitHub Actions Secrets 已有 `TAURI_SIGNING_PRIVATE_KEY`。本地密钥无密码时，**不要**配置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
4. GitHub Actions Secrets 已有 `RELEASES_REPO_TOKEN`：只授权 `moralmaker/cursor-tools-releases`、权限 Contents: Read and write 的 fine-grained token。
5. 目标标签和同名 Release 都不存在：
  ```bash
   git ls-remote --tags origin 'v0.1.8'
   gh release view v0.1.8 --repo moralmaker/cursor-tools-releases
  ```
   后者报 `release not found` 才是预期。
6. 本机先跑检查和一次不打安装包的桌面编译：
  ```bash
   make check
   npm --prefix apps/desktop run tauri:build -- --debug --no-bundle
  ```

只有仓库所有者（`github.repository_owner`，现为 `moralmaker`）推标签才会通过 `prepare` 里的作者校验。别人推 `v*` 会失败。

---



## 3. 本机单端打包（自测，不是 Releases）

本机产物用本地生成的 `.tauri/cursor-tools.local.key` 签名，和 GitHub Secret 里的正式密钥不是一把。装包可以自己点开试，**已安装用户不会从这包自动更新**。

```text
make build-desktop
```


| 系统            | 实际命令                         | 产物大致位置                        |
| ------------- | ---------------------------- | ----------------------------- |
| macOS / Linux | `tauri build`（Makefile 已包一层） | `target/release/bundle/`      |
| Windows x64   | `tauri build --bundles nsis` | `target/release/bundle/nsis/` |


Windows ARM64 + SMB 工作区的特殊环境变量见仓库根 [README.md](../README.md) 的 Development 一节，不要拿到正式 Releases 里用。

本机**没有**官方四端矩阵。不要在一台 Mac 上交叉编译 Windows / Linux 安装包来当正式包。

---



## 4. 正式多端打包（GitHub Actions）

触发器只有：

```yaml
on:
  push:
    tags:
      - "v*"
```

推 `main`、手动 `workflow_dispatch` 都不会发版。

### 4.1 四端矩阵

```text
publish
├── linux-x86_64     ubuntu-22.04      默认 bundles（deb / rpm / AppImage 等）
├── windows-x86_64   windows-latest    --bundles nsis
├── macos-aarch64    macos-15          --target aarch64-apple-darwin
└── macos-x86_64     macos-15-intel    --target x86_64-apple-darwin
```

macOS 另读 `apps/desktop/src-tauri/tauri.macos.conf.json`，`targets` 只有 `app`（`.app` + updater 用的 `.app.tar.gz`），不打 dmg。Windows 只打 NSIS（`*-setup.exe`）。Linux 跟随 `tauri.conf.json` 的 `bundle.targets = "all"`。

macOS job 把 `APPLE_SIGNING_IDENTITY` 设为 `-`，不做 Apple 开发者签名 / 公证。

`fail-fast: false`：一端失败不会取消另外三端，但 `finalize` 要求四端都成功才会把 draft 改成正式 Latest。

### 4.2 发布步骤

版本号 commit 已经在本地且检查通过之后：

```bash
# 1. 只提交版本清单和必要源码，推 main
git add \
  apps/desktop/package.json \
  apps/desktop/package-lock.json \
  apps/desktop/src-tauri/Cargo.toml \
  apps/desktop/src-tauri/tauri.conf.json \
  Cargo.lock
git status          # 确认没有 .tauri/、config.toml、无关改动
git commit -m "Release desktop v0.1.8"
git push origin HEAD:main

# 2. 确认 commit 已在 origin/main
git fetch origin
git merge-base --is-ancestor HEAD origin/main && echo ok

# 3. 打标签并推标签 —— 这一步才触发打包
git tag v0.1.8
git push origin v0.1.8
```

看运行：

```bash
gh run list --workflow "Release desktop app" --limit 5
gh run watch
```

工作流地址：`https://github.com/moralmaker/cursor-toosl/actions/workflows/release.yml`

### 4.3 工作流在做什么

```text
prepare
  ├── GITHUB_ACTOR == 仓库所有者
  ├── Secret TAURI_SIGNING_PRIVATE_KEY、RELEASES_REPO_TOKEN 非空
  ├── 三个清单 version 相同，且标签 == v<version>
  ├── 该 commit 是 origin/main 的祖先
  └── 若 v<version> 已是正式 Release → 整次跳过（不重发）

publish（每端）
  ├── npm ci && tauri-action@v1
  │     在公开仓库 cursor-tools-releases 创建 draft Release（若尚无，标签建在它的 main 上）
  │     上传该端安装包、.sig、latest.json（uploadUpdaterJson: true）
  └── 额外打旧客户端更新包到 artifact
        Linux    cursor-tools-<ver>-linux-amd64.tar.gz
        Windows  cursor-tools-<ver>-windows-amd64.zip + .sig
        macOS    cursor-tools-<ver>-macos-arm64.tar.gz
                 cursor-tools-<ver>-macos-amd64.tar.gz

finalize
  ├── 规范化 latest.json 下载 URL
  ├── 生成 update.json（旧版 v0.0.49 客户端）
  ├── 生成 portable-latest.json（Windows 便携包）
  ├── 上传上述清单和 legacy 包
  └── gh release edit --draft=false --latest
```

中途失败时 Release 可能停在 draft。不要手改标签或覆盖已发布版本；修代码后升号重走全流程。

---



## 5. Release 里应该有哪些文件

安装包文件名由 Tauri 按 `productName`（`Cursor TOOLS`）+ 版本 + 架构生成，以当次 Actions 日志为准。当前产品名是 **Cursor TOOLS / cursor-tools-***，不是历史上的 CursorBYOK。

### 5.1 用户下载的安装包（Tauri）


| 平台                  | 典型产物                                       | 给谁用          |
| ------------------- | ------------------------------------------ | ------------ |
| Windows x64         | `*_x64-setup.exe` 以及对应 `.sig`              | 安装版；应用内更新走这份 |
| Linux x64           | `.AppImage` / `.deb` / `.rpm` 以及需要的 `.sig` | 发行版对应格式      |
| macOS Apple Silicon | `.app.tar.gz` 以及 `.sig`                    | arm64        |
| macOS Intel         | `.app.tar.gz` 以及 `.sig`                    | x64          |




### 5.2 更新清单（必须有）


| 文件                     | 用途                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `latest.json`          | 现桌面端 Tauri updater。客户端还配置了 `https://ops.susuan.ai/api/v1/updates/latest.json` 作为优先端点 |
| `update.json`          | 旧版 `v0.0.49` 客户端                                                                     |
| `portable-latest.json` | Windows 便携包更新                                                                        |




### 5.3 旧客户端 / 便携包


| 文件                                         | 平台             |
| ------------------------------------------ | -------------- |
| `cursor-tools-<ver>-macos-arm64.tar.gz`    | macOS arm64    |
| `cursor-tools-<ver>-macos-amd64.tar.gz`    | macOS x64      |
| `cursor-tools-<ver>-windows-amd64.zip`     | Windows 便携 exe |
| `cursor-tools-<ver>-windows-amd64.zip.sig` | 上面 zip 的签名     |
| `cursor-tools-<ver>-linux-amd64.tar.gz`    | Linux 可执行文件    |


发完后用浏览器打开 [Releases](https://github.com/moralmaker/cursor-tools-releases/releases/latest)，确认不是 draft、`prerelease` 为 false、并且是 Latest。

```bash
gh api repos/moralmaker/cursor-tools-releases/releases/latest \
  --jq '{tag:.tag_name,draft:.draft,prerelease:.prerelease,assets:[.assets[].name]}'
```

---



## 6. 发完之后：客户端怎么更新

```text
已安装桌面端
  ├── 安装版    GET latest.json
  │               优先 ops.susuan.ai/api/v1/updates/latest.json
  │               回退 GitHub .../releases/latest/download/latest.json
  ├── 便携 Windows  GET portable-latest.json（同样先 ops 再 GitHub）
  └── 旧版 v0.0.49  GET update.json
```

只发 GitHub、不更新 ops 时：走 GitHub 回退的客户端仍能更新；走 ops 优先端点的客户端要等运营把这份 Release 导入 Worker。

运营后台：`ops` 管理台 Releases 页，或调用 `POST /api/admin/releases/import-github`，从公开仓库 `moralmaker/cursor-tools-releases` 的 `latest.json` / `portable-latest.json` 写入 D1。细节见 `[ops/README.md](../ops/README.md)`。

桌面端设置页可以看到当前版本和待安装版本。更新验的是 `tauri.conf.json` 里的 **公钥**，和打包装时用的 **私钥** 必须是一对。

---



## 7. 验收清单

- [ ] 标签 `v<version>` 存在，且指向已在 `origin/main` 上的 commit
- [ ] Release 已发布（非 draft），`prerelease: false`，是 Latest
- [ ] 四端安装包都在 Assets 里，带 updater `.sig`
- [ ] `latest.json`、`update.json`、`portable-latest.json` 都在
- [ ] 四个 `cursor-tools-<ver>-{macos-arm64,macos-amd64,windows-amd64,linux-amd64}` 包都在；Windows zip 有 `.sig`
- [ ] 测试版标题或正文写了 Beta，但 GitHub 仍是普通 Latest
- [ ] 需要走 ops 的客户端：已导入该版本

---



## 8. 常见问题


| 现象                                                            | 原因 / 处理                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| 推了 `main` 但 Actions 没打安装包                                     | 正常。只有推 `v*` 标签才触发                                            |
| `Release tag must point to a commit contained in origin/main` | 先把发版 commit 推到 `main`，再打标签                                   |
| `tag ...` 与 version 不一致                                       | 标签必须是 `v` + 清单 version，例如清单 `0.1.8-beta.1` → `v0.1.8-beta.1` |
| `Only ... may publish a release`                              | 不是仓库所有者推的标签                                                  |
| `TAURI_SIGNING_PRIVATE_KEY is not configured`                 | 在仓库 Settings → Secrets 写入正式私钥                                |
| `RELEASES_REPO_TOKEN is not configured` / 创建 Release 403          | 在源码仓库 Secrets 写入对 `cursor-tools-releases` 有 Contents 写权限的 token |
| `Version ... is already published; nothing to do`             | 该号已发过，升号                                                     |
| 一端红、Release 停在 draft                                          | 看该 matrix job 日志；修好后升号重打，不要 `--force` 挪已有标签                  |
| 本机装包能开，应用内提示更新失败                                              | 本机用的是 `.local.key`，和线上公钥不是一对                                 |
| 想重发同一个已发布版本                                                   | 不允许。升一个新号再走全流程                                               |
| 手动把 Release 标成 Prerelease                                     | 客户端拿不到 `/releases/latest`。不要这样做                              |


不要删除、替换、移动已经发布的标签或 Release，除非另有明确授权。不要把 `.tauri/cursor-tools.key` 写进仓库或发到聊天里。

---



## 9. 相关文件

```text
.github/workflows/release.yml                 # 发版工作流
.github/scripts/generate-legacy-update.mjs    # update.json
.github/scripts/generate-portable-update.mjs  # portable-latest.json
.github/scripts/normalize-tauri-update.mjs    # 修正 latest.json 下载 URL
apps/desktop/src-tauri/tauri.conf.json        # 版本、安装包、updater 公钥与端点
apps/desktop/src-tauri/tauri.macos.conf.json  # macOS 只打 app
Makefile                                      # 本机 build-desktop / check
```

