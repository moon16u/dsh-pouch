# @moon16u/dsh-restart

[English](./README.md) | **中文**

安全脱钩的 DSH 进程重启命令（`/restart`、`/dsh-restart`）与 Agent 工具（`dsh_restart`），配齐原生风格的 Web UI 候选菜单。

**仅支持 Web 宿主，明确不支持 Windows 和 macOS 的 DeepSeek Harness 官方桌面端。** 桌面端请退出应用后重新打开。`dsh.unsupportedProfiles: ["desktop"]` 供已应用补丁的官方安装器在安装阶段拒绝本包；旧安装器或绕过 DSH 安装的情况，运行时也会拒绝桌面宿主。尚未读取该声明的现有官方版本不能保证安装阶段拦截。

Windows/macOS Web 宿主使用官方启动器的 `appExit` 服务和独立 Node helper。helper 保留 Node 可执行文件、CLI 参数、overlay、工作目录与 DSH home，确认旧宿主退出后再启动替代进程；不依赖 Bash、`setsid`、`/proc`、Shell 命令拼接或桌面进程控制。原生适配面向独立 Node.js CLI/Web 宿主；Electron、IPC 托管、Bun 和嵌入式可执行文件宿主会被拒绝。Linux/WSL 保留原有 Shell 与 systemd 路径。

兜底错误页只提供回环地址的 HTTP 服务。原生 HTTPS 或非回环访问场景的失败会保留诊断标记与日志；helper 不重建宿主的 TLS 或对外监听配置。

## 特性
- **零冻结**：由分离的 worker 进程调度重启，固定 3 秒安全延迟，会话不卡死。
- **斜杠命令**：在对话中输入 `/restart`（或兼容旧版 `/dsh-restart`）即可直接触发平滑重启。
- **原生 Web UI 候选**：下拉候选菜单呈现为 `🔄 重启 restart`，配备刷新图标与双语本地化描述，回车或点击直接生效（无冗余输入占位）。
- **Agent 工具**：AI Agent 可在需要时自愈重启 DSH。
- **调度错误反馈**：脚本缺失、Shell 语法错误、启动工具缺失、helper/日志写入失败，会返回命令错误或 `ok: false` 工具结果。后台 helper 失败通过需认证的只读接口轮询，在发起会话的 Web UI 中提示一次原因和日志位置；同时写入 `restart-failed.json`，供后续模型请求获取失败上下文，不自行发起模型对话。
- **失败可见**：重启失败（新进程死亡或未就绪）时，`dsh-restart.sh` 会在端口上托管一个自包含错误页——失败原因、日志尾部、以及释放端口重试的「重启 DSH」按钮；该服务总会自行退出，绝不阻塞后续手动启动。下次成功启动还会在对话里附一行「上次重启失败」提示（`restart-failed.json` 标记）。

## 安装

独立安装本插件：

```bash
dsh plugin --profile web add @moon16u/dsh-restart
```

安装后需**重启一次 `dsh web`**（bundle 层只在启动时组合）。无需手改 `cordis.patch.yml`——包内自带挂载补丁。

## 测试
```bash
npm test
```
冒烟测试设置 `DSH_RESTART_DRY_RUN=1` 并使用临时 `DSH_HOME`，只写 helper、不启动进程。打包和调度失败测试只执行临时包副本中的无害脚本，绝不执行真实重启 worker；客户端 bundle 使用模拟 RPC 结果和状态响应验证。在这些隔离副本之外，不设此标志会调度真实的分离重启。

测试入口按平台选择用例。原生测试在 Linux、Windows 和 macOS 上使用一次性的 Node/HTTP 测试宿主，不操作现网 DSH；非 Linux 平台略过仅针对 Shell 路径的测试。`Restart Native Platforms` workflow 在三个操作系统上运行不依赖外部包的原生测试；原生错误页的重试使用 Node，不再使用 Bash。

## 许可
[MIT](../../LICENSE)
