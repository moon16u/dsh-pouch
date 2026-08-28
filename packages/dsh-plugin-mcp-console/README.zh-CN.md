# @moon16u/dsh-plugin-mcp-console

[English](./README.md) | **中文**

DSH（DeepSeek Harness）Web GUI 的 **MCP 服务器管理控制台**：在设置页里增删改查、启停、重连 MCP 服务器，实时状态与工具列表，`mcpServers` JSON 一键导入，profile YAML 自动吸纳与回写。

**不实现任何 MCP 协议代码**——连接、重连退避、工具发现/注册、`mcp__<server>__<tool>` 命名、图片桥接全部由官方 `@deepseek-ai/dsh-mcp-client` 完成；本插件只做「配置存储 + 生命周期编排 + HTTP API + GUI」。

## 安装

```bash
# dsh-pouch 已装则跳过（本包随 pouch bundle 分发）
dsh plugin --profile web add @moon16u/dsh-pouch
# 独立安装（发布后）：
dsh plugin --profile web add @moon16u/dsh-plugin-mcp-console
```

安装后**重启一次 `dsh web`**（bundle 层只在启动时组合）。之后打开 DSH Web → 左下角设置 → **「MCP 服务器」**。

## 能力

| 能力 | 说明 |
|---|---|
| 服务器管理 | 新增（stdio / streamable-http 双模式表单）、编辑、删除、启停、重连；改配置即时生效，无需重启 dsh（删除即用户意志，不留备份文件） |
| 工具级开关 | 展开服务器卡片，点击工具胶囊单独启停；禁用的工具调用会被执行期 guard 拒绝 |
| 实时状态 | 运行中/连接中/启动中/已停用/失败 分级；SSE 推送刷新，工具数实时联动 |
| JSON 导入 | 粘贴 Claude / Cursor 风格 `mcpServers` JSON，预览后导入，同名跳过并报告 |
| Auto-Ingest | 外部 agent / 脚本按官方推荐写入 `cordis.patch.yml` 的 MCP 条目，在启动与「同步配置并刷新状态」时自动移入动态管理（store 持久化成功才修剪 YAML，绝不丢配置） |
| YAML 回写 | `POST /api/dsh-mcp-console/export-yaml` 把动态配置一键还原为标准 `cordis.patch.yml` 条目（卸载/备份可逆） |

## 配置存储

- 动态配置：`~/.dsh/dsh-mcp.json`（版本化 JSON，原子写：临时文件 + rename，不产生备份文件）
- profile 层：`~/.dsh/profiles/web/cordis.patch.yml`（ingest 引擎只动其中的 mcp-client 条目，其余条目与注释原样保留）

## HTTP API（loopback-only，前缀 `/api/dsh-mcp-console/`）

`GET /health` · `GET/POST /servers` · `PATCH/DELETE /servers/:name` · `POST /servers/:name/enable|disable|reconnect` · `POST /refresh`（吸纳 YAML + 重试失败）· `POST /import` · `POST /export-yaml` · `GET /events`（SSE）· `GET/PUT /config`（UI 配置）

## 已知限制（诚实口径）

1. **连接级状态**：官方 client 未暴露结构化连接事件，「连接中」与「重连中第 N 次」不可区分；状态口径为「fiber 装载态 + 工具前缀计数」。
2. **工具级禁用的暴露面**：`tools.restrict()` 在 dsh-tools 中要求 agent-scope（全局限制被明确禁止），故被禁用的工具仍出现在模型工具列表中，但调用被 guard 拒绝并在结果中说明。
3. **首次迁移的启动竞态**：极小概率下 boot 期 loader 与 ingest 引擎同时装配同一 serverName，loader 侧 fiber 会报一次 duplicate 错误（无害，下次启动 YAML 已修剪，不再复现）。
4. **rc 版本耦合**：依赖官方包的 cordis/webserver/tools 契约，收敛在 `clientAdapter.js`（动态解析 profile 里的官方 client，与 loader 共享同一模块实例）与 `routes.js`。

## 开发

```bash
pnpm --filter @moon16u/dsh-plugin-mcp-console test     # 42 个测试
node scripts/sync-root-client.mjs                      # 改 lib/client.js 后同步进 dsh-pouch 根 bundle
```

包内 `lib/client.js` 与 dsh-pouch 根 `lib/client.js` 中的标记段由同步脚本保持一致，测试锁定防漂移。
