# @moon16u/dsh-plugin-session-id

[English](./README.md) | **中文**

在 Web 会话顶栏显示当前 DSH Session ID 徽章，一键复制到剪贴板。

## 特性
- 会话顶栏工具区的原生风格 Session ID 按钮。
- 一键复制并即时反馈（非安全源自动回退 `execCommand`）。
- 纯客户端 UI 插件（无宿主开销）。

## 安装

随 [`@moon16u/dsh-pouch`](../../README.zh-CN.md) 套件安装（推荐）：

```bash
dsh plugin --profile web add @moon16u/dsh-pouch
```

或独立安装本插件：

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-session-id
```

两种方式安装后都需**重启一次 `dsh web`**。无需手改 `cordis.patch.yml`——包内自带挂载补丁。

## 许可
[MIT](../../LICENSE)
