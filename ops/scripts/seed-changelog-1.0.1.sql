UPDATE releases
SET
  changelog_title = '下载加速、公开下载页与运营统计',
  changelog_body = '## 这一版做了什么

1.0.1 把安装包分发和更新检查接到了 ops 加速通道，并补齐公开下载站与运营侧统计能力。

### 下载与更新

- 安装包与更新资产托管在 Cloudflare R2，经 `ops.susuan.ai` 分发，避免客户端直连 GitHub 过慢
- 桌面端优先拉取 ops 上的 `latest.json`，失败再回退 GitHub Releases
- 公开下载页按设备推荐安装包；macOS 提供「下载 MacOS 版本」（`.app.tar.gz`）

### 运营后台

- 广告位支持无按钮内容，并可控制是否允许用户关闭
- 版本可从公开仓库一键导入，并将资产 URL 指到本站加速地址
- 新增「下载统计」：按日、版本、平台与文件汇总经 R2 成功下发的安装包次数

### 站点体验

- 下载页 Hero 文案增加动效
- 提供使用帮助页，说明安装、接管与常见问题

> 若应用内更新不可用，仍可从下载页或 GitHub Releases 获取同一版本。

### 说明

- 同一版本号发布后不会重发；后续修复会升新版本号
- 下载统计只计经 ops R2 的真实下载（`200`），不含签名文件与清单请求',
  changelog_visible = 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE version = '1.0.1';
