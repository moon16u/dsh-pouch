<p align="center">
  <img src="./assets/logo.png" width="96" height="96" alt="dsh-pouch logo" />
</p>

# dsh-pouch

[English](./README.md) | **中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![DeepSeek Harness](https://img.shields.io/badge/DSH-0.2.1--rc.1-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![pnpm workspace](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io/workspaces)

> **dsh-pouch** 是一个包含四个**相互独立、可单独安装**的 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 插件的 monorepo。
> 仓库根目录只是 pnpm workspace——它**不是** DSH bundle，不能安装，也从不发布到 npm。按需安装其中任意插件即可。

---

## 📦 包含插件

| 插件 | 类型 | 描述 |
| :--- | :--- | :--- |
| **[`@moon16u/dsh-plugin-restart`](./packages/dsh-plugin-restart)** | Host / Web UI | 提供 `/restart` 与 `/dsh-restart` 命令、原生 `🔄 重启` 候选菜单与 `dsh_restart` Agent 工具，实现进程分离的安全 3 秒平滑重启。 |
| **[`@moon16u/dsh-plugin-current-time`](./packages/dsh-plugin-current-time)** | Host / Agent | 每轮对话开始时向 Agent 上下文注入宿主机的真实日期、时间与时区，长会话跨天也不会再按旧日期推理。 |
| **[`@moon16u/dsh-plugin-session-copy`](./packages/dsh-plugin-session-copy)** | Web UI | Web 会话顶栏的原生风格「复制」菜单：会话标题、会话目录路径、工作目录。 |
| **[`@moon16u/dsh-plugin-mcp-console`](./packages/dsh-plugin-mcp-console)** | Web UI + Host | 设置页「MCP 服务器」控制台：运行时增删改/启停/重连、工具级开关、SSE 实时状态、mcpServers JSON 导入。零 MCP 协议代码——全部复用官方 `@deepseek-ai/dsh-mcp-client`；profile YAML 里的 MCP 条目在启动/刷新时自动移植为动态管理（可逆回写）。 |

---

## 🚀 安装

每个插件都是独立的 DSH bundle，拥有独立的 npm 包与版本号。按需安装：

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-restart
dsh plugin --profile web add @moon16u/dsh-plugin-current-time
dsh plugin --profile web add @moon16u/dsh-plugin-session-copy
dsh plugin --profile web add @moon16u/dsh-plugin-mcp-console
```

安装后**重启一次 `dsh web`**（bundle 层只在启动时组合）。无需手改 `cordis.patch.yml`——每个包都自带挂载补丁。

### 从本地检出的仓库安装

```bash
git clone https://github.com/moon16u/dsh-pouch.git ~/dsh-pouch
dsh plugin --profile web add file:~/dsh-pouch/packages/dsh-plugin-restart
```

### 从旧的一体化 bundle 迁移

`@moon16u/dsh-pouch` 曾经是一个加载全部插件的单一 bundle。最后一个 bundle 版本是 **0.7.3**，现已弃用、不再更新。如果你的 profile 仍依赖它，请**先移除**再安装各独立包：

```bash
dsh plugin --profile web remove @moon16u/dsh-pouch
```

不要把旧 bundle 与独立包同时安装——两者会加载同一批插件，导致重复的 restart 命令、重复的设置卡片和重复的 MCP 控制台。

---

## 🛠️ 单个插件详解

### 1. `@moon16u/dsh-plugin-restart`
* **痛点**：在修改插件或配置后，需要手动到外部终端重启 DSH 进程；如果在 Agent 内部直接 kill 自身会导致会话卡死；第三方命令在 Web 下拉菜单中缺乏原生图标与中文描述。
* **解决**：在 DSH 内部注册 `/restart` 与兼容旧版的 `/dsh-restart` 斜杠命令、原生风格的 `🔄 重启 restart` 下拉候选装饰与 `dsh_restart` Agent 工具。采用 detached setsid 异步工作进程，回车或点击后即刻响应并在 3 秒后安全平滑重启。

### 2. `@moon16u/dsh-plugin-current-time`
* **痛点**：模型自己没有时钟，只能沿用启动时注入的那一次"今天"。会话跨过午夜后它仍按昨天的日期推理，而对话里没有任何东西会纠正它。
* **方案**：挂载 `agent/pre-step`，在每轮第一步的提问之后追加一条真实时刻读数。按轮而非按步注入，工具调用循环不会把对话刷满几乎相同的时间戳。

### 3. `@moon16u/dsh-plugin-session-copy`
* **痛点**：想拿到当前会话的存储目录、标题或工作目录，只能去翻 URL、控制台日志或手工找文件系统。
* **解决**：在 Web 顶栏工具区注入原生风格的「复制」按钮，点开是一个三项菜单——**会话标题**、**会话目录**（会话真实存储文件夹路径，home 前缀缩写为 `~`）、**工作目录**；某项取值尚不存在时该项禁用并说明原因。目录由宿主侧唯一一个认证只读路由基于 JSONL 后端的公开 `resolveCurrentLog` 解析，复制的是纯路径，仅定位当前格式日志，不读取日志内容，也不取写租约；空返回可能表示尚未落盘或日志格式不受支持，旧代际暂不可定位。

### 4. `@moon16u/dsh-plugin-mcp-console`
* **痛点**：官方接入 MCP 的方式是往 `cordis.patch.yml` 写静态条目——没有 GUI、不能运行时增删改，每次改动都要重启；声明出来的服务器在面板里只能是只读摆设。
* **方案**：设置页新增完整的**MCP 服务器**管理页，基于 cordis 动态装配运行时编排官方 `@deepseek-ai/dsh-mcp-client`（每台一个 fiber，热更新配置、免重启 DSH）：主开关、工具级启停胶囊、SSE 实时状态与工具列表、mcpServers JSON 一键导入。外部 Agent 写进 `cordis.patch.yml` 的 MCP 条目由 Auto-Ingest 引擎接管：启动/刷新时连根移植进 `~/.dsh/dsh-mcp.json`（含 fiber 接管与条目级 YAML 精确修剪），`POST /export-yaml` 可逆回写。所有 API 响应中的凭据一律打码。

---

## 🧪 运行测试

本仓库采用 pnpm workspace 管理，所有插件均包含基于 Node.js 原生测试运行器的单元测试与契约测试：

```bash
cd dsh-pouch
pnpm install
pnpm test
```

---

## 📄 开源协议与致谢

* [MIT License](./LICENSE) © 2026 moon16u
* Logo 图标来源于 [Icons8](https://icons8.com) 的 [Toolbox 图标](https://icons8.com/icon/41P574Kp7REI/toolbox)。
