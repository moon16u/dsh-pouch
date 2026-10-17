# @moon16u/dsh-plugin-web-search-tavily

**English** | [中文](./README.zh-CN.md)

Tavily-backed web search provider for the DeepSeek Harness capability seam (`ctx.web`).

## Features
- Implements official `ctx.web.registerSearchProvider`.
- Secure credential resolution via the DSH Credentials service or launch environment, preferring `TAVILY_API_KEY` and falling back to `DEEPSEEK_API_KEY`.
- Full support for search depth, max results, and answer synthesis mapping.

## Installation

Install this plugin as its own DSH bundle:

```bash
dsh plugin --profile web add @moon16u/dsh-plugin-web-search-tavily
```

**Restart `dsh web` once** after installing.

### Configuration

To make it the active search provider, add this to your profile's
`cordis.patch.yml`:

```yaml
- id: web
  config:
    searchProvider: tavily
```

Advanced per-plugin knobs (rarely needed) go through the insert entry:

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

### Credentials

When `TAVILY_API_KEY` is not configured, the plugin automatically uses `DEEPSEEK_API_KEY`. This supports profiles that point their DeepSeek `baseURL` at Tavily without requiring a duplicate credential entry.

## License
[MIT](../../LICENSE)
