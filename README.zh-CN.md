<p align="center">
  <img src="./assets/logo.png" width="96" height="96" alt="dsh-pouch logo" />
</p>

# dsh-pouch

[English](./README.md) | **中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/@moon16u/dsh-pouch.svg?color=cb3837)](https://www.npmjs.com/package/@moon16u/dsh-pouch)
[![DeepSeek Harness](https://img.shields.io/badge/DSH-0.1.1--rc.2%20%7C%200.1.2--rc.1-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![pnpm workspace](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io/workspaces)

> **dsh-pouch** 是一个专为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 打造的实用小插件工具箱（Pouch Toolkit）。  
> 旨在提供**小而美、轻量、开箱即用**的实用微扩展，提升日常使用与开发体验。

---

## 📦 包含插件

| 插件 | 类型 | 描述 |
| :--- | :--- | :--- |
| **[`@moon16u/dsh-plugin-restart`](./packages/dsh-plugin-restart)** | Host / CLI | 提供 `/dsh-restart` 命令与 `dsh_restart` Agent 工具，实现进程分离的安全 3 秒无损自愈重启。 |
| **[`@moon16u/dsh-plugin-current-time`](./packages/dsh-plugin-current-time)** | Host / Agent | 每轮对话开始时向 Agent 上下文注入宿主机的真实日期、时间与时区，长会话跨天也不会再按旧日期推理。 |
| **[`@moon16u/dsh-plugin-session-id`](./packages/dsh-plugin-session-id)** | Web UI | 在 Web 会话顶栏右侧显示当前 Session ID，支持一键快速复制到剪贴板。 |
| **[`@moon16u/dsh-plugin-web-search-tavily`](./packages/dsh-plugin-web-search-tavily)** | Capability Seam | 基于 Tavily REST API 的真实网络搜索提供方，无缝接入 DSH 官方 `ctx.web` 网络能力标准。 |
| **[`@moon16u/dsh-plugin-llm-headers`](./packages/dsh-plugin-llm-headers)** | LLM 接缝 | 请求头由 `settings.yaml` 说了算的供应方路由（含 DSH 保留的 `User-Agent`）：字面量、`${env:NAME}` 插值、按模型覆盖、`null` 删除，pi-ai 自带的 37 个供应方只写 headers 即可接入。 |
| **[`@moon16u/dsh-plugin-mcp-console`](./packages/dsh-plugin-mcp-console)** | Web UI + Host | 设置页「MCP 服务器」控制台：运行时增删改/启停/重连、工具级开关、SSE 实时状态、mcpServers JSON 导入。零 MCP 协议代码——全部复用官方 `@deepseek-ai/dsh-mcp-client`；profile YAML 里的 MCP 条目在启动/刷新时自动移植为动态管理（可逆回写）。 |
| **[`@moon16u/dsh-plugin-llm-model-listing`](./packages/dsh-plugin-llm-model-listing)** | LLM Seam | 让模型设置页的「获取模型」按钮能问那些把模型列表放在别的路径、且用自家响应格式的网关——一条规则把列表 URL 映射到真实端点并翻译响应。 |

---

## 🚀 快速安装与使用

### 方式一：通过 DSH CLI 一行命令一键安装（推荐 ⭐️⭐️⭐️⭐️⭐️）

只需在终端执行一行命令，DSH 将自动下载并加载全部 6 个实用插件（0 手动配置，开箱即用）：

```bash
# 1. 一键安装整套工具箱（来自 npm）
dsh plugin --profile web add @moon16u/dsh-pouch

# 或直接通过 GitHub 仓库安装
dsh plugin --profile web add https://github.com/moon16u/dsh-pouch.git
```

---

### 方式二：通过 Git 源码本地链接安装

1. **克隆仓库到本地**：
   ```bash
   git clone https://github.com/moon16u/dsh-pouch.git ~/dsh-pouch
   ```

2. **在 DSH Profile 中一键引入 Bundle**：
   ```bash
   dsh plugin --profile web add file:~/dsh-pouch
   ```
   *DSH 将自动识别 `dsh.bundle` 并自动挂载内置的 `cordis.patch.yml`，无需手动编辑配置文件。*

---

## 🛠️ 单个插件详解

### 1. `@moon16u/dsh-plugin-restart`
* **痛点**：在修改插件或配置后，需要手动到外部终端重启 DSH 进程；如果在 Agent 内部直接 kill 自身会导致会话卡死。
* **解决**：在 DSH 内部注册 `/dsh-restart` 斜杠命令与 `dsh_restart` Agent 工具，采用 detached setsid 异步工作进程，先正常返回响应再在 3 秒后平滑重启。

### 2. `@moon16u/dsh-plugin-current-time`
* **痛点**：模型自己没有时钟，只能沿用启动时注入的那一次"今天"。会话跨过午夜后它仍按昨天的日期推理，而对话里没有任何东西会纠正它。
* **方案**：挂载 `agent/pre-step`，在每轮第一步的提问之后追加一条真实时刻读数。按轮而非按步注入，工具调用循环不会把对话刷满几乎相同的时间戳。

### 3. `@moon16u/dsh-plugin-session-id`
* **痛点**：排查问题、查看日志或跨环境关联时，需要获取当前会话的 UUID，但界面上没有直观的复制入口。
* **解决**：在 Web 顶栏工具区优雅注入一个胶囊状的 `Session ID` 按钮，点击即可一键复制。

### 4. `@moon16u/dsh-plugin-web-search-tavily`
* **痛点**：默认搜索引擎可能受限或无法获取高质量结构化检索结果。
* **解决**：标准实现 DSH 的 `ctx.web.registerSearchProvider` 接口，支持通过环境变量 `TAVILY_API_KEY` 或 DSH Credentials 凭据管理服务安全解析密钥。

### 5. `@moon16u/dsh-plugin-llm-headers`
* **痛点**：DSH 在每个供应方请求上最后合入自己的 attribution `User-Agent`，`llm-pi-ai` 里的 `headers` 无法覆盖这个保留名。按客户端标识鉴权的网关——腾讯 CodeBuddy 会返回 `500 {"code":11128,"msg":"request illegal"}`——单靠配置无法接入。
* **方案**：用自己的 `llm-headers` 段落声明路由，仍交给官方 `PiAiAdapter` 承载，只把 pi-ai provider 包了一层，让配置的请求头在进入 socket 前拿到最后一次写权。另附一个**请求头**设置页（独立左侧栏入口）——官方提供方卡片没有对外 slot，且写进 `llm-pi-ai` 的请求头本就会被剥掉。包 provider 而不是协议对象，是为了让 pi-ai 自带的路由保留自己的 API 实现——这类路由两行就能接。未配置 headers 的路由照常发送 DSH attribution，且拒绝删除它。
* **版本跨度**：设置页通过双代线缆读取提供方目录并写入设置——DSH 0.1.1 的 `connection.api`（APIProxy）或 DSH 0.1.2-rc.1 的 `remote.llm` / `remote.settings` 命名空间——宿主提供哪个就用哪个。

### 6. `@moon16u/dsh-plugin-mcp-console`
* **痛点**：官方接入 MCP 的方式是往 `cordis.patch.yml` 写静态条目——没有 GUI、不能运行时增删改，每次改动都要重启；声明出来的服务器在面板里只能是只读摆设。
* **方案**：设置页新增完整的**MCP 服务器**管理页，基于 cordis 动态装配运行时编排官方 `@deepseek-ai/dsh-mcp-client`（每台一个 fiber，热更新配置、免重启 DSH）：主开关、工具级启停胶囊、SSE 实时状态与工具列表、mcpServers JSON 一键导入。外部 Agent 写进 `cordis.patch.yml` 的 MCP 条目由 Auto-Ingest 引擎接管：启动/刷新时连根移植进 `~/.dsh/dsh-mcp.json`（含 fiber 接管与条目级 YAML 精确修剪），`POST /export-yaml` 可逆回写。所有 API 响应中的凭据一律打码。

### 7. `@moon16u/dsh-plugin-llm-model-listing`
* **痛点**：模型设置页的「获取模型」按钮请求 `${baseURL}/models` 并读 OpenAI 形状的响应——路径写死、格式写死，provider 配置里没有任何口子能改。对话接口完全正常、只是把模型列表放在别处的网关永远答不上这个请求：腾讯 CodeBuddy 的 `POST /v2/chat/completions` 可用，`GET /v2/models` 是硬 404，28 个模型的列表在 `GET /v2/enterprises/personal/models`，还裹着自家信封。于是每个模型都得手填，上游一加新模型又得重填。
* **方案**：一条规则认领那个列表 URL。精确匹配的 GET 由规则指定的真实端点回答（转发探测请求自己的请求头），响应翻译成读取方要的四个字段（`id`、`name`、`context_window`、`max_output_tokens`），并支持 `modelsPath`、逐字段名映射，以及用 `excludeTags` 滤掉列表里那些非对话模型。其余请求原样放行——实现 `registerModelDiscovery` 会与 `dsh-llm-pi-ai` 冲突（`DUPLICATE_DISCOVERY`），还会让所有 catalog 路由失去「完全不走网络」的回答方式，所以拦截范围只有一个 URL 宽。`fetch` hook 采用链式包装而非夺取，与 `llm-headers` 共存。

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
