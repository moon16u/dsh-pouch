# @moon16u/dsh-plugin-llm-headers

[English](./README.md) | **中文**

请求头由 `settings.yaml` 说了算的供应方路由——包括 DSH 为自己保留的那些。

## 为什么需要它

DSH 在每个供应方请求上都发送自己的 attribution 头，且该头**无法配置移除**。在
`dsh-llm-pi-ai` 里，路由的 `headers` 要过 `requestHeaders()`——它先剔除配置里的
`user-agent`，再把 harness 自己的身份最后合入：

```js
// @deepseek-ai/dsh-llm-pi-ai
function requestHeaders(headers) {
  const attribution = attributionHeaders();               // { "user-agent": "deepseek-harness/…" }
  const reserved = new Set(Object.keys(attribution).map((name) => name.toLowerCase()));
  return {
    ...Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => !reserved.has(name.toLowerCase()))),
    ...attribution,                                       // ← 最后写权
  };
}
```

这是刻意设计——`attributionHeaders()` 文档明言「任何东西都无法压制」——直到你遇到
按客户端身份鉴权的网关。腾讯 CodeBuddy（`https://copilot.tencent.com/v2`）就是一个：
带着 harness `User-Agent` 的流式请求返回

```
HTTP 500  {"code":11128,"msg":"request illegal"}
```

而字节级相同的请求换成 CodeBuddy 自己的 CLI 身份就正常 `200` 流式返回。

## 工作原理

pi-ai provider 的 `stream`/`streamSimple` 是 HTTP 客户端构建前的最后一站，pi-ai 会把
它们返回的东西原样传下去。本插件用包装后的版本服务自己的路由，让配置的请求头拿到
最后写权：

```js
const force = (model, options) => ({ ...options, headers: overrideHeaders(options?.headers, headers.get(model.id)) });
return { ...base, stream: (m, c, o) => base.stream(m, c, force(m, o)),
                  streamSimple: (m, c, o) => base.streamSimple(m, c, force(m, o)) };
```

`overrideHeaders` 合并前把名字折叠为小写——这是微妙的一半：HTTP 字段名大小写不敏感
但普通对象不是，`user-agent` 和 `User-Agent` 同时留在记录里会让 `fetch` 发出一个
逗号拼接的字段，而不是覆盖。

包装 *provider* 而不是协议实现，正是让 pi-ai 自带路由保留自己的 API 实现、同时带上
部署请求头的原因。其余全是原装适配器：路由由 `@deepseek-ai/dsh-llm-pi-ai` 的
`PiAiAdapter` 承载，流式、重试、推理力度、图片处理、凭据解析与 `llm-pi-ai` 路由
完全一致。

## 设置界面

pouch 套件会在 DSH 设置弹窗注册一个**请求头**页（独立左侧栏入口，与「模型」并列），
列出除官方 DeepSeek 外的所有活跃提供方，每个一张请求头表格：

```
┌ Deepseek-V4-Flash   codebuddy ─────────────────────────────┐
│  user-agent   │ CLI/unknown CodeBuddy/2.137.1  │  ×        │
│  [ 添加请求头 ]                        [ 保存 ]             │
└────────────────────────────────────────────────────────────┘
```

**值留空**表示*移除该请求头*——与 YAML 里 `null` 同义，两者可互相往返。删除行则是
不再发送它。

### 为什么不在「模型」页

官方模型页无法扩展：提供方卡片是手写 `<details>`，页面未声明内部 slot；且把路由写进
provider 目录只会得到一张死卡片（保存被禁用）。详见[英文版](./README.md)的完整分析。

## 配置速览

```yaml
llm-headers:
  providers:
    codebuddy:
      api: openai-compatible
      baseURL: https://copilot.tencent.com/v2
      apiKeyEnv: CODEBUDDY_API_KEY
      models:
        - id: deepseek-chat
          headers:
            user-agent: CLI/unknown CodeBuddy/2.137.1
            x-custom: from-env-${env:MY_VAR}
```

- 字面量、`${env:NAME}` 任意位置插值、按模型覆盖、`null` 删除全部支持。
- pi-ai 自带 37 个供应方只需写 headers 即可接入（catalog 路由两三行搬过来）。

完整字段表与语义见[英文版](./README.md#configuration)。

## 它做不到的一件事

**无法给官方适配器仍在服务的路由加请求头。** DSH 每个路由只允许一个适配器——
`ctx.llm.registerAdapter` 遇到已占路由抛 `DUPLICATE_ADAPTER`，全有或全无——所以路由
必须从 `llm-pi-ai.providers` **搬**进 `llm-headers.providers`，不能两边都写。对 catalog
路由这个搬运只要两三行，因为其余字段 catalog 仍然供给。

冲突会在 DSH 日志报告，且只丢该路由的 headers：本插件在 `dsh-base` 之后加载，官方
适配器已认领的路由全部保留。无法服务的路由单独跳过并留日志行，配置错别字不会注销
Agent 正在用的路由。

## 安装

随 [`@moon16u/dsh-pouch`](../../README.zh-CN.md) 套件安装：

```bash
dsh plugin --profile web add @moon16u/dsh-pouch
```

或独立安装本插件：

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-llm-headers
```

两种方式安装后都需**重启一次 `dsh web`**。无需手改 `cordis.patch.yml`——包内自带挂载补丁。

## 测试

```bash
pnpm test
```

`test/wire.test.mjs` 驱动真实请求穿过 `PiAiAdapter` 打到回环端点，断言到达的请求头——
覆盖、`${env:}` 插值、删除、按模型优先级、catalog 路由分发。这是值得保留的测试：
未来 DSH 改变请求头组装位置时它们会失败。

## 许可
[MIT](../../LICENSE)
