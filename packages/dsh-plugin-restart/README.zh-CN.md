# @moon16u/dsh-plugin-restart

[English](./README.md) | **中文**

安全脱钩的 DSH 进程重启命令（`/dsh-restart`）与 Agent 工具（`dsh_restart`）。

## 特性
- **零冻结**：由分离的 worker 进程调度重启，固定 3 秒安全延迟，会话不卡死。
- **斜杠命令**：在对话中输入 `/dsh-restart` 即可触发。
- **Agent 工具**：AI Agent 可在需要时自愈重启 DSH。
- **失败可见**：重启失败（新进程死亡或未就绪）时，`dsh-restart.sh` 会在端口上托管一个自包含错误页——失败原因、日志尾部、以及释放端口重试的「重启 DSH」按钮；该服务总会自行退出，绝不阻塞后续手动启动。下次成功启动还会在对话里附一行「上次重启失败」提示（`restart-failed.json` 标记）。

## 安装

随 [`@moon16u/dsh-pouch`](../../README.zh-CN.md) 套件安装（推荐）：

```bash
dsh plugin --profile web add @moon16u/dsh-pouch
```

或独立安装本插件：

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-restart
```

两种方式安装后都需**重启一次 `dsh web`**（bundle 层只在启动时组合）。无需手改 `cordis.patch.yml`——包内自带挂载补丁。

## 测试
```bash
npm test
```
测试套件设置 `DSH_RESTART_DRY_RUN=1`：调度只写 helper 文件、不真正拉起进程。不设此标志时，每次处理都会真实分离重启 `$DSH_HOME` 指向的 DSH 实例。

## 许可
[MIT](../../LICENSE)
