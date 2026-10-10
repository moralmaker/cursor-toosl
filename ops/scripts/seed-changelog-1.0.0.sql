UPDATE releases
SET
  changelog_title = '正式版：在你工作的地方使用自己的模型',
  changelog_body = '## 这一版是什么

1.0.0 是 Cursor TOOLS 的首个正式版。它在本机运行模型网关：接收 Cursor 发出的 Agent 请求，转发到你自己配置的模型服务，并尽量保留工具调用、Skills、MCP 和多轮对话。

产品免费且开源。密钥与配置保存在本机；模型请求仍会发往你选择的上游服务商。

> 本项目是独立项目，与 Cursor 或其开发者没有关联。你连接的模型服务商可能按用量收费。

## 主要功能

### 自定义模型通道

为每个模型单独填写服务地址、API Key、模型 ID 和生成参数。可以连接 Cursor 默认通道之外的服务，并在 Cursor 模型列表中显示你设定的名称。

### 多种 API 协议

| 模型系列 | 模型类型 | 建议协议 |
| --- | --- | --- |
| Claude 系列 | Anthropic | Messages API |
| GPT / OpenAI 系列 | OpenAI | Responses API |
| 其他模型 | OpenAI | Chat Completions API |

GPT 系列建议使用 Responses API，以便保留提示词缓存。

### 模型管理

- 添加、复制、编辑、排序多条模型配置
- 保存后可运行测试，确认地址、协议、密钥和流式响应正常
- 连接测试可查看首字延迟、生成速度和原始服务商响应

### Agent 能力

在 Cursor 中继续使用工具调用、Skills、MCP 和多轮对话。配置完成后保持 Cursor TOOLS 运行，在 Cursor 里手动选择已配置的模型（不要使用 Auto）。

### 会话指标

查看 Token 用量、缓存命中率、对话轮次和估算价值。

### TAB 补全

Tab 补全走独立 TAB 服务，可在公益服务、官方直连、自建 `tab-server` 之间切换。

### 跨平台

提供 macOS（Apple 芯片 / Intel）、Windows 安装版与便携版、Linux（AppImage / deb / rpm）安装包。

## 开始使用

1. 从[下载页](https://ops.susuan.ai/download/)安装对应系统版本
2. 打开 **Cursor 配置**，按提示初始化本地 CA
3. 在模型设置中添加通道，保存并测试
4. 保持 Cursor TOOLS 运行
5. **首次配置后完全退出并重新打开 Cursor**，再新开对话，选择已配置的模型

完整步骤见[使用帮助](https://ops.susuan.ai/download/guide.html)。

## 与官方账号并存

- 可在 Cursor 中登录自己的官方账号，官方模型与本地模型随时切换
- Auto 只使用官方模型，不会自动选用本地通道
- 插件、代码库索引等 Cursor 功能可继续使用

## 说明

- API Key 与设置保存在本机
- 首次升级 Cursor 或首次配置后，已打开的对话不会加载新连接，需要新开对话
- 同一版本号发布后不会重发；后续修复会升新版本号',
  changelog_visible = 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE version = '1.0.0';
