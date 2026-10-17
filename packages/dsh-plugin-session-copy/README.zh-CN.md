# @moon16u/dsh-plugin-session-copy

[English](./README.md) | **中文**

从 Web 会话顶栏复制当前会话的标题、存储目录或工作目录。

## 特性
- 会话顶栏工具区的原生风格「复制」按钮。
- 点击展开一个菜单，包含三个复制目标：**会话标题**、**会话目录**、**工作目录**。
- **会话目录**复制会话真实存储文件夹的纯路径（尾部分隔符、无 `file://` 前缀、不做百分号编码），由宿主侧只读路由解析；会话尚未写入磁盘、或存储后端无法定位时该项禁用并给出原因。
- **会话标题**与**工作目录**复制顶栏已经在显示的值。
- 即时反馈（`已复制` / `复制失败`）并带 `aria-live` 播报；异步 Clipboard API 不可用时，由共享剪贴板工具回退 `execCommand`，写入被拒绝时显示失败。
- 主体是客户端 UI；宿主侧只新增一个认证只读的目录查询路由。

## 安装

随 [`@moon16u/dsh-pouch`](../../README.zh-CN.md) 套件安装（推荐）：

```bash
dsh plugin --profile web add @moon16u/dsh-pouch
```

或独立安装本插件：

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-session-copy
```

两种方式安装后都需**重启一次 `dsh web`**。无需手改 `cordis.patch.yml`——包内自带挂载补丁。

## 宿主路由

`GET /api/dsh-session-copy/directory?sessionId=<id>`——由 connection 服务认证，只读，`no-store`。
它通过 JSONL 持久化后端的公开 `resolveCurrentLog(id, signal)` 定位日志，返回
`{ok:true, directory}`（纯文件系统路径）。该接口仅定位当前格式日志，旧代际日志暂不能通过此菜单复制目录；
空返回无法区分尚未落盘与日志格式不受支持。不读取日志内容，不做 flush、迁移，也不取写租约。
Session ID 是非空 opaque 字符串，路径编码由后端负责。
失败使用固定错误码：`400 invalid_session_id`、`404 directory_unavailable`、
`501 not_supported`、`503 persistence_unavailable`、`500 resolve_failed`。

## 许可
[MIT](../../LICENSE)
