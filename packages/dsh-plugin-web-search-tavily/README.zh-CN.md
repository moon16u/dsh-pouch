# @moon16u/dsh-plugin-web-search-tavily

[English](./README.md) | **中文**

基于 Tavily REST API 的网络搜索提供方，标准接入 DSH 官方 `ctx.web` 能力接缝。

## 特性
- 标准实现 `ctx.web.registerSearchProvider` 官方契约。
- 凭据安全解析：优先 `TAVILY_API_KEY`，自动回退 `DEEPSEEK_API_KEY`（经 DSH Credentials 服务或启动环境）。
- 完整支持搜索深度、结果数与答案合成映射。

## 安装

独立安装本插件：

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-web-search-tavily
```

安装后需**重启一次 `dsh web`**。

### 配置

想让它作为活跃搜索提供方，在 profile 的 `cordis.patch.yml` 里加：

```yaml
- id: web
  config:
    searchProvider: tavily
```

高级参数（一般用不到）走 insert 条目：

```yaml
- insert:
    - id: web-search-tavily
      name: '@moon16u/dsh-plugin-web-search-tavily'
      config:
        apiKeyEnv: TAVILY_API_KEY
        baseURL: https://api.tavily.com/search
        searchDepth: basic
        maxResults: 5
```

### 凭据

未配置 `TAVILY_API_KEY` 时自动使用 `DEEPSEEK_API_KEY`——支持把 DeepSeek `baseURL`
指向 Tavily 的 profile，无需重复录入凭据。

## 许可
[MIT](../../LICENSE)
