# 深空精工令牌与页面清单

原型源码：`apps/desktop/prototype/styles/tokens.css`。React 侧把这些色映射进 `apps/desktop/src/styles/_themes.scss`，不要在组件里写死新的色板。

## 颜色

| 角色 | 深色 | 浅色 |
| --- | --- | --- |
| 底 | `#0A0D13` | `#F4F6F9` |
| 侧栏 | `#0D1118` | `#ECEFF4` |
| 卡片 | `#111620` | `#FFFFFF` |
| 抬升 | `#161C28` | `#F7F9FC` |
| 输入 | `#1B2230` | `#FFFFFF` |
| 文字 | `#E6EAF2` / `#A3ADBD` / `#6B7588` | `#0F1623` / `#4A5568` / `#7A8496` |
| 分隔 | `rgba(148,163,184,.10)` | `rgba(15,22,35,.08)` |
| 信号青 | `#35D0E0`，悬停 `#5FE3F0`，字 `#062126`，浅底 `rgba(53,208,224,.12)` | `#0B93A6`，悬停 `#087F90`，字 `#F4FFFE` |
| 成功 / 警告 / 错误 | `#3DD68C` / `#F5B94A` / `#F26D6D` | `#1F9D62` / `#B5811A` / `#D64545` |

协议标签：Anthropic `#E8A27A`，OpenAI Responses `#6EA8FE`，OpenAI Chat `#A79BFF`。

图表：输入（非缓存）`#4AA8FF`，缓存输入 `#35D0E0`，缓存写入 `#7C8CFF`，模型输出 `#F5B94A`。

## 尺寸与字

| 令牌 | 值 |
| --- | --- |
| 侧栏 / 收起 | 208px / 64px |
| 页头 / 标题条 | 52px / 36px |
| 圆角 | 控件 8，卡片 12，面板与抽屉 14 |
| 字号 | 12 / 13 / **14** / 16 / 18 / 20 / 30 |
| 行高 | 1.55 |
| 缓动 | `cubic-bezier(.2, .8, .2, 1)` |
| 时长 | 120 / 180 / 240 ms |

中文用系统字体（PingFang SC、Microsoft YaHei）。指标数字用现有 `HFKos`。模型 ID、地址、调用 ID 用等宽字体。

## 图标

从 `@iconify/json` 的 `solar.json` 取成对变体：`*-line-duotone` 与 `*-bold-duotone`。

| 位置 | 名称 |
| --- | --- |
| 概览 | `chart-2` |
| 调用 | `history-2` |
| Cursor | `cpu-bolt` |
| 插件 | `widget-5` |
| 设置 | `settings` |
| 搜索 | `minimalistic-magnifer` |

导航未选中用 line-duotone、`currentColor` 为次要文字色；选中用 bold-duotone 且颜色为信号青。

## 各页必须有的状态

- 概览：时间范围（近10分钟、近1小时、近1自然日、近一周、近一个月、自定义）、刷新、四张指标卡、日 Token 堆叠柱、过去一年热力图。首次使用可显示快速开始（初始化 CA → 开启接管 → 添加模型 → 测试 → 重启 Cursor），全部完成后收起。
- 调用：实时标记、关键列默认可见、列设置、状态筛选与搜索、失败行淡红底、行点击开右侧抽屉（调用信息 / 请求 / 响应流 / Cursor 追踪）。
- Cursor：接管开关；门禁为 CA 未初始化、CA 未信任、还没有模型；行卡含品牌图块、显示名、模型 ID、协议标签、测试状态和测试 / 编辑 / 更多；分组为平铺、按供应商、按类型。
- 插件：运行时未初始化、初始化中、失败、不支持；Codex / Grok / Google 卡；账号管理与 OAuth 设备码。
- 设置：分组导航，最后一项关于。关于含版本、检查更新或下载并安装、官网、更新日志、GitHub、可关闭标星。

## 对照命令

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory apps/desktop
```

打开 `http://127.0.0.1:4173/prototype/`。审查条可切换深浅色、macOS / Windows、820×558、1040×700、1280×800，以及正常 / 首次使用 / 异常。
