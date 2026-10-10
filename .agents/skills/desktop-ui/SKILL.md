---
name: desktop-ui
description: >-
  Design and implement Cursor TOOLS desktop pages in the Deep Space visual system.
  Use when changing apps/desktop layout, navigation, settings, themes, icons, charts,
  empty states, or when the user mentions 新版 UI, 深空, 信号青, 侧栏, or the desktop prototype.
---

# Cursor TOOLS 桌面 UI（深空精工）

视觉以「深空精工」为准：深色优先，信号青只做点缀，浅色同步。可点击对照稿在 `apps/desktop/prototype/`（本地预览 `http://127.0.0.1:4173/prototype/`，从 `apps/desktop` 起静态服务）。

实现仍遵守 [frontend](../frontend/SKILL.md)：`PageLayout`、`PageActions`、虚拟滚动、`t()`、不新增运行时依赖。本规范管外观与交互，不改 HTTP 边界。

## 气质

- 中性色铺满界面。信号青只出现在选中、主按钮、焦点环、实时状态。面积要小。
- 不用纯黑纯白。深色用细边框加顶部微高光，不用重阴影。光晕只放在侧栏顶部一层。
- 图标用 Solar 一套。导航静止为线性双色，选中变为实心双色并染信号青。同一几何，状态靠「点亮」。操作图标 16px 线性。品牌图标放进 28px 中性底图块。不要彩色扁平图标混用。
- 动效克制：悬停/按下 120ms，页面进入与 Toast 180ms，面板/抽屉 240ms，缓动 `cubic-bezier(.2, .8, .2, 1)`。尊重 `prefers-reduced-motion`。
- 每个页面先回答用户此刻要做的事。门禁（未初始化、未信任、空列表、失败）用一块说明加一个主按钮，不要堆解释文案。

## 壳

```
侧栏 208px（⌘/ 收成 64px 图标轨）
  状态胶囊：接管 + 本地服务；点开看 CA、代理端口、开关接管
  概览 ⌘1 / 调用 ⌘2 / Cursor ⌘3 / 插件 ⌘4
  广告紧凑卡片（未读点、可关闭）
  设置 ⌘Z
内容
  标题与页面级操作盖在滚动区顶部
  唯一滚动区是内容
  编辑用内容区全页面板；详情用右侧抽屉；侧栏保持可点
  ⌘K 命令面板：跳转、操作、搜模型与设置
```

菜单文案与页标题一致：概览、调用、Cursor、插件、设置。不要只有一两项的分组标题。收起后轨道保留状态点，悬停提示带快捷键。切页时内容 180ms 淡入上移 6px；收起侧栏只动侧栏宽度，内容在动画结束后一次重排。

复杂表单（模型编辑）走全页面板：左侧表单，右侧「在 Cursor 里显示的样子」加内联测试，底栏固定「取消 / 保存并测试 / 保存」。未保存就离开要确认。调用详情走右侧抽屉，保留「在新窗口打开」。

## 设置

页内分组，不要再堆一长串平级卡片。顺序固定，最后一项是关于：

通用（语言、主题）→ 调用观测 → 网络（端口、代理）→ TAB → Commit → 应用（开机启动、静默启动、Dock）→ 数据（旧版导入、存储）→ 关于

关于里放版本和检查更新 / 下载并安装，以及官网 `https://ops.susuan.ai/download/`、更新日志 `https://ops.susuan.ai/download/changelog/`、GitHub `https://github.com/moralmaker/cursor-toosl`、可关闭的标星提示。软件更新不要留在应用设置里。

## 落地时对照

1. 先看原型对应页面，再改 React。色值、圆角、字号、图标状态以 [reference.md](reference.md) 为准。
2. 颜色写入 `src/styles/_themes.scss` 的现有 `--vscode-*` 令牌，不要另起一套运行时主题。
3. 字号只用 `_typography.scss` 的档位。正文与普通标题用 `base`（14px），次要用 `xs`，指标数字才用到 30px 档。
4. 新文案走 `t("中文")`，并补 `zh-CN.json` / `en-US.json`（sha256 前 16 位为键）。
5. 页面级操作进 `PageActions`。行内只留针对这一行的编辑、删除、测试。

## 不要做

- 不要引入新图标库、动画库或图表库。图标来自已安装的 `@iconify/json` Solar，图表继续用 ECharts。
- 不要把原型的 `overflow: auto` 页面壳搬进 React。滚动仍走 `VirtualPage` / `VirtualList`。
- 不要在 macOS 红绿灯和顶部拖拽条上放控件。
