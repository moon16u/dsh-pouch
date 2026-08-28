# @moon16u/dsh-plugin-current-time

[English](./README.md) | **中文**

在每轮对话开始时，把宿主机的真实日期时间注入 Agent 上下文。

## 为什么需要

模型没有时钟。它只能沿用 harness 启动时注入的那一次「今天」——短会话没问题，
长会话就是错的：跨过午夜后它仍按昨天的日期推理，而对话里没有任何东西会纠正它。

本插件在每轮开头放一条真实的墙上时钟读数，让相对推理（「明天截止」「那是三小时前」）
有真实的锚点。

## 行为

每轮第一步，在 prompt 之后追加一条 durable 的 `user` 消息：

```md
<system-reminder>当前时间：2026-08-22 周六 01:55:30（UTC+0800，Asia/Shanghai）。这是本轮开始时的真实时刻，每轮自动刷新；请以最近的一条为准，不要根据对话历史推断当前日期或时间。</system-reminder>
```

三个刻意的设计选择：

- **按轮注入而非按步**。`agent/pre-step` 在工具调用循环的后续步骤也会触发，
  每步都打戳只会把对话刷满几乎相同的读数，对模型毫无新信息。
- **追加而非前置**。读数属于它所描述的 prompt 之后，最新时间戳是模型最后读到的东西。
- **durable，历史读数保留**。DSH 没有 ephemeral 消息形态，每轮读数留在历史里——
  追加式写入对 prompt 缓存友好，留下诚实的时间线；代价是每轮多一条短消息。
  结尾那句提醒正是防止模型把旧戳当成「现在」。

被拒绝或空的首步不动——没有请求需要读数陪伴。

## 星期与时区

星期名写死在插件里而不是读 locale：DSH 可能跑在没装 `zh_CN` 的主机上，
`toLocaleDateString` 会静默回退英文。时区标签来自
`Intl.DateTimeFormat().resolvedOptions().timeZone`；在缺完整 ICU 数据的主机上，
提醒仍带数字 UTC 偏移。

## 安装

随 [`@moon16u/dsh-pouch`](../../README.zh-CN.md) 套件安装（推荐）——宿主入口自动挂载，无需单独安装：

```bash
dsh plugin --profile web add @moon16u/dsh-pouch
```

或独立安装本插件：

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-current-time
```

两种方式安装后都需**重启一次 `dsh web`**。无需手改 `cordis.patch.yml`——包内自带挂载补丁。

## 测试

```bash
node --test test/*.test.mjs
```

## 许可
[MIT](../../LICENSE)
