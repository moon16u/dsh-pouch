# @moon16u/dsh-plugin-mcp-console

[English](./README.md) | **中文**

DSH（DeepSeek Harness）Web GUI 的 **MCP 服务器管理控制台**：在设置页里增删改查、启停、重连 MCP 服务器，实时状态与工具列表，`mcpServers` JSON 一键导入，profile YAML 自动吸纳与回写。

**不实现任何 MCP 协议代码**——连接、重连退避、工具发现/注册、`mcp__<server>__<tool>` 命名、图片桥接全部由官方 `@deepseek-ai/dsh-mcp-client` 完成；本插件只做「配置存储 + 生命周期编排 + HTTP API + GUI」。

## 安装

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-mcp-console
```

安装后**重启一次 `dsh web`**（bundle 层只在启动时组合）。之后打开 DSH Web → 左下角设置 → **「MCP 服务器」**。

## 能力

| 能力 | 说明 |
|---|---|
| 服务器管理 | 新增（stdio / streamable-http 双模式表单）、编辑、删除、启停、单机重连；改配置即时生效，无需重启 dsh（删除即用户意志，不留备份文件）。编辑表单「高级选项」可设置官方 `reconnect` 策略与 `maxInstructionBytes` |
| 连接测试 | 每台服务器一键「测试连接」：起一个一次性官方 client fiber（强制 `failOnStartupError`）真实握手，报告工具数与延迟；对运行中的服务器则如实报告实时状态（官方 client 的 serverName 命名空间不允许旁路重连） |
| 工具级开关 | 展开服务器卡片，点击工具胶囊单独启停；禁用的工具调用会被执行期 guard 拒绝 |
| 实时状态 | 运行中/连接中/启动中/已停用/失败 分级；SSE 推送刷新，工具数实时联动 |
| JSON 导入 | 粘贴 Claude / Cursor 风格 `mcpServers` JSON，预览后导入，同名跳过并报告 |
| Auto-Ingest | 外部 agent / 脚本按官方推荐写入 `cordis.patch.yml` 的 MCP 条目，在启动与「同步配置并刷新状态」时自动移入动态管理。按 YAML 语义读取并定位条目，保留内联 `args`/`env`、`reconnect`、注释与引号；只有成功持久化且与 store 一致的具体条目才从原文件移除，其余原样保留并报告原因 |
| YAML 回写 | 顶栏「导出 YAML」（`POST /api/dsh-mcp-console/export-yaml`）把动态配置一键还原为标准 `cordis.patch.yml` 条目（卸载/备份可逆） |
| 模型感知 | 通过 `ctx.systemPrompt.section` 向每个 agent 的系统提示注入一段公告：MCP 管理请到设置页操作，勿手改配置文件（独立 inject 作用域，无该服务的宿主上自动休眠） |
| 设置集成 | `enabled` / `announceToAgent` 总开关为 schema 自发现的 `export const Config` 中的 `.volatile()` 字段（rc.2 SettingsForms）：设置 GUI 可改、就地热更新，无需重启 DSH：`enabled` 关闭整体下线（路由 + MCP 连接 + 公告，store 保留），`announceToAgent` 只控制公告；无 settings 服务的宿主回落条目默认值 |
| 设置 GUI 卡片 | 设置 → 插件 页的「MCP 控制台」卡片（`plugins.item`，键 `ui-mcp-console`）：可折叠、与官方卡片同形（同一批 `--dsw-alias-*` 令牌与尺寸），开关即改即写，被改过的字段带「已自定义」徽章与逐字段「恢复默认」。卡片与开关都通过当前宿主的 `configForms` 服务绑定，服务未组合时整卡自动休眠，MCP 服务器页照常工作 |
| 项目作用域 | 服务器可标记为「仅当前项目生效」：按请求携带的会话 id 解析当前 live agent 与工作目录，配置存进该项目的 `.dsh/mcp.json`，连接与工具只在对应 agent 作用域内注册；无有效会话时保持全局模式并如实显示 `hasProjectWorkspace: false` |

> **项目视图是「全局 + 项目」的合并视图。** 在项目会话里打开页面时，全局服务器仍然正常显示、可编辑、可做工具级开关；只有名字属于项目 store 的服务器才走项目实例。两台实例各自持有自己的连接与 guard，页面只合并列表。无有效会话（或解析不到工作目录）时退回纯全局视图，并按 `hasProjectWorkspace: false` 如实标注。
| 停用后的降级 | `enabled` 关闭后「MCP 服务器」页不再报接口错误，改为显示停用提示与恢复入口，并停开 SSE 以免反复重试 |

## 配置存储

- 动态配置：`~/.dsh/dsh-mcp.json`（版本化 JSON，原子写：临时文件 + rename，不产生备份文件）
- 插件开关：DSH 官方 settings 用户文档的 `ui-mcp-console` 节（设置 GUI 编辑、官方持久化）；插件页开关由当前宿主的 `configForms` 表单读写
- 项目配置：`<项目根>/.dsh/mcp.json`（与全局同构，按会话工作区切换）
- profile 层：`~/.dsh/profiles/web/cordis.patch.yml`（ingest 引擎只动其中的 mcp-client 条目，其余条目与注释原样保留）

## HTTP API（loopback-only，前缀 `/api/dsh-mcp-console/`）

`GET /health` · `GET/POST /servers` · `PATCH/DELETE /servers/:name` · `POST /servers/:name/enable|disable|reconnect|probe` · `POST /refresh`（吸纳 YAML + 重试失败）· `POST /import` · `POST /export-yaml` · `GET /events`（SSE）· `GET /config`（已解析的总开关；写入走官方设置表单）

项目作用域的服务器按 `?sessionId=<id>` 路由到该会话的项目 store；缺省或无效会话按全局处理。`PUT /config` 不再支持（返回 405）：开关只走官方设置表单。

**回环围栏四层校验**（借鉴 dsh-skills-mcp-manager）：socket 对端地址、Host 头必须是回环源（防 DNS rebinding）、拒绝 `sec-fetch-site: cross-site`、Origin（若携带）必须与 Host 同源。`GET /config` 同样受围栏保护。

## 已知限制（诚实口径）

1. **连接级状态**：官方 client 未暴露结构化连接事件，「连接中」与「重连中第 N 次」不可区分；状态口径为「fiber 装载态 + 工具前缀计数」。
2. **工具级禁用的暴露面**：`tools.restrict()` 在 dsh-tools 中要求 agent-scope（全局限制被明确禁止），故被禁用的工具仍出现在模型工具列表中，但调用被 guard 拒绝并在结果中说明。
3. **命名空间歧义**：`mcp__<server>__<tool>` 前缀在服务名含 `__` 时可能重叠（如 `foo` 与 `foo__bar`）。此时相关服务器的工具归属、连接与工具开关一律停用并在卡片上说明原因，不做猜测式归属。
4. **rc 版本耦合**：依赖官方包的 cordis/webserver/tools 契约，收敛在 `clientAdapter.js`（动态解析 profile 里的官方 client，与 loader 共享同一模块实例）与 `routes.js`。
5. **运行中服务器的「测试连接」**：官方 client 的 serverName 命名空间按模块实例保留，运行中的服务器无法旁路重连测试；此时按钮返回实时状态（`live: true`）而非新握手结果。新握手探测硬超时 15s。
6. **导出与工具开关**：`POST /export-yaml` 写的是官方 client 能表达的字段；`disabledTools` 官方客户端不支持，带工具限制的服务器不会被静默导出，而是拒绝并说明（先停用或移除限制）。
7. **项目作用域依赖宿主服务**：项目解析需要 `agents` 与 `workingDirectory`；宿主未组合时控制台保持全局模式，不会用进程 cwd 猜测工作区。

## 开发

```bash
pnpm --filter @moon16u/dsh-plugin-mcp-console test
