# @moon16u/dsh-mcp-console

[English](./README.md) | **中文**

DSH（DeepSeek Harness）Web GUI 的 **MCP 服务器管理控制台**：在侧边栏「插件」→「内置插件配置」→「MCP 控制台」增删改查、启停、重连 MCP 服务器，实时状态与工具列表，`mcpServers` JSON 一键导入，profile YAML 自动吸纳与回写。

**不实现任何 MCP 协议代码**——连接、重连退避、工具发现/注册、`mcp__<server>__<tool>` 命名、图片桥接全部由官方 `@deepseek-ai/dsh-mcp-client` 完成；本插件只做「配置存储 + 生命周期编排 + HTTP API + GUI」。

## 安装

```bash
dsh plugin --profile web add @moon16u/dsh-mcp-console
```

安装后**重启一次 `dsh web`**（bundle 层只在启动时组合）。之后打开侧边栏 **「插件」→「内置插件配置」→「MCP 控制台」**。插件加载后自动接管，不再有「启用 MCP 控制台」总开关；旧配置中的 `enabled: false` 不再关闭管理功能。

## 平台适配

- 目标运行环境为 Linux、原生 Windows 和 macOS；以 DSH 宿主所在系统为准，不以浏览器所在系统为准。
- 配置目录直接复用官方 `resolveDshHome()`：显式路径优先于 `DSH_HOME`；空白环境变量回落默认目录，支持 `~`、`~/`、`~\` 和相对路径。profile 符号链接及 Windows junction 可用于客户端模块解析。
- JSON/YAML 使用同目录独占临时文件替换。Windows 对 `EACCES` / `EBUSY` / `EPERM` 按官方策略限次重试；失败不先删除旧配置。Linux/macOS 新文件使用 `0600`，新目录使用 `0700`；这些 mode 位不等于 Windows ACL 保证。
- `command`、`args`、`cwd` 原样交给官方 MCP 客户端；不会添加 shell、转换 Linux 启动脚本或改写 Windows 反斜杠。请填写宿主系统上真实可用的命令。
- `pnpm --filter @moon16u/dsh-mcp-console test` 隔离配置与临时目录，包含官方客户端启动本地 stdio 夹具、工具发现和启停测试；不连接用户真实 MCP 服务。测试夹具移至临时目录中的 `.recovered` 路径，不递归删除。
- Linux 与原生 Windows 已通过本地包级验证；已配置三系统 CI，macOS 原生验证仍待对应 runner 执行。后端适配更新后需重启 DSH，刷新网页不会重载后端模块。

## 能力

| 能力 | 说明 |
|---|---|
| 服务器管理 | 新增（stdio / streamable-http 双模式表单）、编辑、删除、启停、单机重连；改配置即时生效，无需重启 dsh（删除即用户意志，不留备份文件）。编辑表单「高级选项」可设置官方 `reconnect` 策略与 `maxInstructionBytes` |
| 连接测试 | 每台服务器一键「测试连接」：起一个一次性官方 client fiber（强制 `failOnStartupError`）真实握手，报告工具数与延迟；对运行中的服务器则如实报告实时状态（官方 client 的 serverName 命名空间不允许旁路重连） |
| 工具级开关 | 展开服务器卡片，点击工具胶囊单独启停；禁用的工具调用会被执行期 guard 拒绝 |
| 实时状态 | 运行中/连接中/启动中/已停用/失败 分级；SSE 推送刷新，工具数实时联动 |
| JSON 导入 | 粘贴 Claude / Cursor 风格 `mcpServers` JSON，预览后导入，同名跳过并报告 |
| Auto-Ingest | 外部 agent / 脚本按官方推荐写入 `cordis.patch.yml` 的 MCP 条目，在启动与「同步配置并刷新状态」时自动移入动态管理。按 YAML 语义读取并定位条目，保留内联 `args`/`env`、`reconnect`、注释与引号；只有成功持久化且与 store 一致的具体条目才从原文件移除，其余原样保留并报告原因 |
| 自动返还 | 成功接管后及每次全局配置修改后，自动维护官方 Loader 可读取的返还块。插件存在时原生回退连接不启动；卸载后由官方客户端接续，不依赖 npm 卸载脚本。无须手动导出 |
| 模型感知 | 默认开启的 `announceToAgent` 公告提供当前宿主实际使用的 `dsh-mcp.json` 路径，引导模型直接修改插件 JSON，保存后调用刷新接口并核验状态；不编辑官方 YAML 或返还块。可单独关闭公告，不影响 MCP 管理 |
| 配置集成 | 仅保留 `.volatile()` 的 `announceToAgent` 字段，修改后热更新公告；服务器连接与管理随插件生命周期运行 |
| 单一界面 | 全部管理界面只注册一个 `plugins.item` 入口（`ui-mcp-console`），展示服务器列表、增删改查、导入、工具开关和公告设置；无设置页入口、重复卡片或自定义/恢复默认按钮 |
| 项目作用域 | 服务器可标记为「仅当前项目生效」：按请求携带的会话 id 解析当前 live agent 与工作目录，配置存进该项目的 `.dsh/mcp.json`，连接与工具只在对应 agent 作用域内注册；无有效会话时保持全局模式并如实显示 `hasProjectWorkspace: false` |

> **项目视图是「全局 + 项目」的合并视图。** 在项目会话里打开页面时，全局服务器仍然正常显示、可编辑、可做工具级开关；只有名字属于项目 store 的服务器才走项目实例。两台实例各自持有自己的连接与 guard，页面只合并列表。无有效会话（或解析不到工作目录）时退回纯全局视图，并按 `hasProjectWorkspace: false` 如实标注。

## 接管与卸载边界

- 已有配置成功纳管后，服务器工具发现、连接启停、逐工具禁用均可正常管理；无法安全迁移的条目保留原样并报告原因，不强行覆盖。
- 返还块使用官方 `cordis:group` 和 Loader 的 `!!js` 条件，不引用插件 JavaScript。正常关机不会改写/返还一次旧快照；即使宿主停机后从 CLI 卸载，下一次启动仍可加载最近一次成功保存的全局配置。
- 原生宿主不支持热卸载时，按其要求停止宿主、卸载再启动；插件不会绕过宿主限制。
- 带工具级限制的服务器返还为停用，避免权限扩大。项目 store 始终留在原项目的 `.dsh/mcp.json`；卸载后不会自动变成全局连接，也不会假称官方会读取这个插件专有 store。
- 外部手改返还块、冲突条目、损坏标记会阻止覆盖并报告错误。成功保存的管理修改必须同时更新 store 和返还块。
- 直接编辑 `dsh-mcp.json` 后，在运行中的宿主调用 `POST /api/dsh-mcp-console/refresh`（或点击页面刷新按钮），再读取服务器状态确认；仅保存文件不会重载连接或同步返还块，不要用重启代替同步。JSON 根结构是 `version` + `servers`，不是导入用的 `mcpServers`。

## 配置存储

- 动态配置：`~/.dsh/dsh-mcp.json`（版本化 JSON，原子写：临时文件 + rename，不产生备份文件）
- 公告设置：DSH 官方 settings 用户文档的 `ui-mcp-console` 节；通过 `configForms` 读写。
- 项目配置：`<项目根>/.dsh/mcp.json`（与全局同构，按会话工作区切换）
- profile 层：`~/.dsh/profiles/web/cordis.patch.yml`（ingest 引擎只动其中的 mcp-client 条目，其余条目与注释原样保留）

## HTTP API（loopback-only，前缀 `/api/dsh-mcp-console/`）

`GET /health` · `GET/POST /servers` · `PATCH/DELETE /servers/:name` · `POST /servers/:name/enable|disable|reconnect|probe` · `POST /refresh`（吸纳 YAML + 重试失败）· `POST /import` · `POST /export-yaml` · `GET /events`（SSE）· `GET /config`（公告设置；写入走官方设置表单）

项目作用域的服务器按 `?sessionId=<id>` 路由到该会话的项目 store；缺省或无效会话按全局处理。`PUT /config` 不再支持（返回 405）：公告设置只走官方设置表单。

**回环围栏四层校验**（借鉴 dsh-skills-mcp-manager）：socket 对端地址、Host 头必须是回环源（防 DNS rebinding）、拒绝 `sec-fetch-site: cross-site`、Origin（若携带）必须与 Host 同源。`GET /config` 同样受围栏保护。

## 已知限制（诚实口径）

1. **连接级状态**：官方 client 未暴露结构化连接事件，「连接中」与「重连中第 N 次」不可区分；状态口径为「fiber 装载态 + 工具前缀计数」。
2. **工具级禁用的暴露面**：`tools.restrict()` 在 dsh-tools 中要求 agent-scope（全局限制被明确禁止），故被禁用的工具仍出现在模型工具列表中，但调用被 guard 拒绝并在结果中说明。
3. **命名空间歧义**：`mcp__<server>__<tool>` 前缀在服务名含 `__` 时可能重叠（如 `foo` 与 `foo__bar`）。此时相关服务器的工具归属、连接与工具开关一律停用并在卡片上说明原因，不做猜测式归属。
4. **rc 版本耦合**：依赖官方包的 cordis/webserver/tools 契约，收敛在 `clientAdapter.js`（动态解析 profile 里的官方 client，与 loader 共享同一模块实例）与 `routes.js`。
5. **运行中服务器的「测试连接」**：官方 client 的 serverName 命名空间按模块实例保留，运行中的服务器无法旁路重连测试；此时按钮返回实时状态（`live: true`）而非新握手结果。新握手探测硬超时 15s。
6. **卸载后的工具限制**：工具读取和逐工具启停在接管期间正常可用。官方 MCP 客户端没有 `disabledTools` 配置字段，因此带工具禁用记录的全局服务器在返还时保持停用；完整限制仍保存在 store，重装后继续使用。不会因卸载而静默放开被禁用工具。
7. **项目作用域依赖宿主服务**：项目解析需要 `agents` 与 `workingDirectory`；宿主未组合时控制台保持全局模式，不会用进程 cwd 猜测工作区。

## 开发

```bash
pnpm --filter @moon16u/dsh-mcp-console test
