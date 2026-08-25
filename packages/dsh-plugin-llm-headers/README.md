# @moon16u/dsh-plugin-llm-headers

Provider routes for DeepSeek Harness whose request headers are yours to set from
`settings.yaml` — including the ones the harness reserves for itself.

## Why this exists

DSH sends its own attribution header on every provider request, and that header
cannot be configured away. In `dsh-llm-pi-ai`, a route's `headers` map goes
through `requestHeaders()`, which drops any `user-agent` the configuration set
and then merges the harness's own identity in last:

```js
// @deepseek-ai/dsh-llm-pi-ai
function requestHeaders(headers) {
  const attribution = attributionHeaders();               // { "user-agent": "deepseek-harness/…" }
  const reserved = new Set(Object.keys(attribution).map((name) => name.toLowerCase()));
  return {
    ...Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => !reserved.has(name.toLowerCase()))),
    ...attribution,                                       // ← wins
  };
}
```

That is deliberate — `attributionHeaders()` is documented as something "nothing
can suppress" — and it is fine until a gateway gates on client identity. Tencent
CodeBuddy (`https://copilot.tencent.com/v2`) is one: a streaming request carrying
the harness `User-Agent` comes back

```
HTTP 500  {"code":11128,"msg":"request illegal"}
```

while the byte-identical request carrying CodeBuddy's own CLI identity returns
`200` and streams normally.

## How it works

A pi-ai provider's `stream`/`streamSimple` are the last stop before the HTTP
client is built, and pi-ai passes whatever they hand back straight through. This
plugin serves its routes with those wrapped, so the configured headers get the
final word:

```js
const force = (model, options) => ({ ...options, headers: overrideHeaders(options?.headers, headers.get(model.id)) });
return { ...base, stream: (m, c, o) => base.stream(m, c, force(m, o)),
                  streamSimple: (m, c, o) => base.streamSimple(m, c, force(m, o)) };
```

`overrideHeaders` folds names to lower case before merging. That is the subtle
half: HTTP field names are case-insensitive but a plain object is not, so leaving
both `user-agent` and `User-Agent` in the record makes `fetch` send one
comma-joined field — not an override.

Wrapping the *provider* rather than the protocol implementation is what lets a
route pi-ai already ships keep its own API implementations while still carrying
deployment headers. Everything else is the stock adapter: routes are served by
`PiAiAdapter` from `@deepseek-ai/dsh-llm-pi-ai`, so streaming, retries, reasoning
effort, image handling, and credential resolution behave exactly as on an
`llm-pi-ai` route.

## The settings UI

The pouch bundle registers a **请求头 / Request headers** page in DSH's settings
dialog (its own left-nav entry, beside 模型). It lists every live provider except
the official DeepSeek one and gives each a header table:

```
┌ Deepseek-V4-Flash   codebuddy ─────────────────────────────┐
│  user-agent   │ CLI/unknown CodeBuddy/2.137.1  │  ×        │
│  [ 添加请求头 ]                        [ 保存 ]             │
└────────────────────────────────────────────────────────────┘
```

An empty **value** means *remove this header* — the same thing `null` means in
YAML, so the two round-trip through each other. Deleting the row instead just
stops sending it.

### Why it is not on the Models page

The official provider card renders a hand-written `<details>` block and that page
declares no inner slot, so nothing can add a field inside 自定义设置 without
forking a 131 KB bundled component. And a header written into `llm-pi-ai` would
be stripped by that adapter's `requestHeaders()` before it reached the socket —
a box that looks like it works and does nothing. So the page is its own
`settings.section` occupant, editing the namespace that actually carries headers.

### Saving moves the route

DSH allows one adapter per provider route. When you save headers for a provider
whose profile still lives under `llm-pi-ai.providers`, that profile is copied
verbatim into `llm-headers.providers` and the `llm-pi-ai` entry is removed — a
route cannot be served twice, and headers only reach the wire from this side.
The copy is safe because schemastery passes fields this schema does not name
straight through, so `baseURL`, `api`, `models`, and `compat` survive untouched.
The stored API key is unaffected: it lives in the credentials service under the
reference the profile records.

Two consequences worth knowing:

- The Models page stops showing that provider's profile, because it reads
  `llm-pi-ai`. Manage it here from then on.
- The two namespaces are written in sequence, ours first. Between the two writes
  the stock adapter still owns the route, so this plugin's registration
  legitimately loses that round. It retries on `llm/adapters-updated`, so the
  route is picked up the moment its previous owner lets go — without that retry a
  route freed by an edit to *another* namespace would stay unregistered until the
  next DSH start, invisible everywhere including the model picker.

A route this section declares is listed on the page even when no adapter is
serving it, with a note saying so. Hiding it would hide the only place to fix it.

The page writes only `headers`. Everything else — per-model maps, `${env:NAME}`
values, `modelOverrides` — stays a `settings.yaml` edit, and the page leaves
those fields alone when it saves.

## Configuration

Add a `llm-headers` section to `~/.dsh/settings.yaml`.

### A route pi-ai already ships

Name any of pi-ai's installed providers (`deepseek`, `anthropic`, `openai`,
`openrouter`, `google`, `amazon-bedrock`, `github-copilot`, `nvidia`, … 37 of
them) and it keeps its whole catalog, endpoint, protocol, auth, and API
implementation. Headers are all you add:

```yaml
llm-headers:
  providers:
    deepseek:
      apiKeyEnv: DEEPSEEK_API_KEY
      headers:
        user-agent: my-fleet/2.1
        x-cost-center: research
```

### A route pi-ai has never heard of

Spell out the endpoint, the protocol, and the models:

```yaml
llm-headers:
  providers:
    codebuddy:
      apiKeyEnv: CODEBUDDY_API_KEY
      api: openai-completions
      baseURL: https://copilot.tencent.com/v2
      headers:
        user-agent: CLI/unknown CodeBuddy/2.137.1
      compat:
        supportsDeveloperRole: false
      models:
        - id: deepseek-v4-flash
          name: Deepseek-V4-Flash
          contextWindow: 660000
          maxTokens: 50000
          reasoningEfforts: &eff
            low: low
            medium: medium
            high: high
            xhigh: xhigh
            max: max
        - id: deepseek-v4-pro
          name: Deepseek-V4-Pro
          contextWindow: 660000
          maxTokens: 50000
          reasoningEfforts: *eff
```

### What a header value may be

```yaml
      headers:
        user-agent: my-fleet/2.1              # a literal
        x-tenant: ${env:TENANT_ID}            # read from the launching environment
        x-gateway-auth: Bearer ${env:TOKEN}   # substituted anywhere in the value
        nvcf-poll-seconds: null               # remove this header entirely
```

`${env:NAME}` reads the launcher's environment snapshot — the same place a
credential reference resolves from — so a machine-specific or secret value stays
out of `settings.yaml`. An unset variable fails the route by name and never
echoes any value into the log. Substitution happens once when the section is
resolved, so a changed variable takes effect on the next DSH start.

`null` removes the header. It reaches two of the three places a header can come
from: what the installed catalog stamps on a model (pi-ai's `nvidia` models carry
`NVCF-POLL-SECONDS`) and what the layers above add. It cannot reach the OpenAI
SDK's own `x-stainless-*` defaults, which the SDK sets on itself.

Removing the attribution header is refused — set it to the identity the endpoint
expects instead. Replacing the harness identity is what this plugin is for; going
unidentified is not, and a route that configures no `headers` still sends it.

### Per-model headers

A model entry's `headers` merge over the route's, so one model can carry an extra
routing header while its siblings do not:

```yaml
    gateway:
      api: openai-completions
      baseURL: https://gateway.internal/v1
      headers:
        x-tier: shared
      models:
        - id: fast
        - id: dedicated
          headers:
            x-tier: premium
            x-pool: gpu-a
```

### Narrowing a catalog route

`modelOverrides` reshapes named entries without replacing the list; a `models`
list replaces it, each entry still defaulting its unset fields from the installed
model of the same id:

```yaml
    openai:
      apiKeyEnv: OPENAI_API_KEY
      headers:
        x-cost-center: research
      modelOverrides:
        gpt-5.2:
          name: GPT-5.2 (research pool)
          maxTokens: 8192
```

### Route fields

| Field | Meaning |
| :--- | :--- |
| `headers` | Request headers that outrank every layer above, reserved names included. |
| `apiKeyEnv` | Credential reference resolved per request. Omit to use the catalog provider's own ambient discovery. |
| `api` | `openai-completions`, `openai-responses`, or `anthropic-messages`. Omit on a catalog route. |
| `baseURL` | Endpoint. Omit on a catalog route to keep the installed one. |
| `models` | Replaces the served catalog. Required for a route pi-ai does not ship. |
| `modelOverrides` | Reshape installed catalog entries by id. Catalog routes only, and not beside `models`. |
| `displayName` | Name shown in model pickers; defaults to the route key. |
| `compat` | pi-ai wire-compatibility switches, defaulting every model on the route. |
| `reasoning` | Route-level default effort. |
| `timeoutMs`, `streamIdleTimeoutMs` | Request and provider-idle bounds. |

### Model fields

`id` is required in a `models` entry and lives in the key for a `modelOverrides`
entry. Everything else — `name`, `contextWindow`, `maxTokens`, `input`,
`reasoningEfforts`, `compat`, `headers` — is optional and falls back to the
installed catalog entry of the same id, then to `262144` / `32768` / `[text]` /
non-reasoning.

`reasoningEfforts` is translated the way `dsh-llm-pi-ai` translates it:
undeclared levels are pinned to unsupported, because pi-ai's own defaulting reads
an absent key as supported for `minimal`–`high` but unsupported for
`xhigh`/`max`. Declaring the levels you want is therefore enough.

Unlike a stock route, `compat` is passed through without checking it against the
protocol — a switch the protocol does not take is ignored by pi-ai rather than
refused here.

## The one thing this cannot do

**It cannot add headers to a route the stock adapter keeps serving.** DSH allows
exactly one adapter per provider route — `ctx.llm.registerAdapter` throws
`DUPLICATE_ADAPTER`, all-or-nothing — so a route has to be *moved* out of
`llm-pi-ai.providers` into `llm-headers.providers`, not declared in both. For a
catalog route that move is two or three lines, because the catalog still supplies
everything else.

A collision is reported in the DSH log and costs only that route's headers: this
plugin loads after `dsh-base`, so the stock adapter has already claimed its
routes and keeps every one of them.

An unserviceable route is skipped with its own log line rather than taking the
section down, so a typo in a spare route cannot unregister the one the agent is
running on.

## Installation

Ships inside the [`@moon16u/dsh-pouch`](../../README.md) bundle:

```bash
dsh plugin --profile web add @moon16u/dsh-pouch
```

## Tests

```bash
pnpm test
```

`test/wire.test.mjs` drives real requests through `PiAiAdapter` into a loopback
endpoint and asserts on the headers that arrive — override, `${env:}`
substitution, removal, per-model precedence, and catalog-route dispatch. Those
are the tests worth keeping: they fail if a future DSH version changes where
request headers are assembled.

## License

[MIT](../../LICENSE)
