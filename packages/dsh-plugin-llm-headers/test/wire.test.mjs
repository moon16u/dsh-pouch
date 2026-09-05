import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";

import { resolveProfile } from "../lib/index.js";

const CODEBUDDY_UA = "CLI/unknown CodeBuddy/2.137.1";

/**
 * A throwaway OpenAI-completions endpoint that records what actually arrived.
 *
 * The whole point of this plugin is header values on the wire, and every layer
 * that could drop them — `requestHeaders()`'s attribution merge, pi-ai's auth
 * merge, the session-affinity headers, the OpenAI client's own defaults — sits
 * between the config and the socket. Only a real request proves an override
 * survived, so these assert against a loopback server instead of a mock.
 */
async function recordingEndpoint() {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      requests.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.write(`data: ${JSON.stringify({
        id: "probe",
        object: "chat.completion.chunk",
        created: 0,
        model: "probe-model",
        choices: [{ index: 0, delta: { role: "assistant", content: "ok" }, finish_reason: null }],
      })}\n\n`);
      res.write(`data: ${JSON.stringify({
        id: "probe",
        object: "chat.completion.chunk",
        created: 0,
        model: "probe-model",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })}\n\n`);
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    requests,
    baseURL: `http://127.0.0.1:${server.address().port}/v1`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Stand-in for the launcher's environment snapshot. */
function env(vars = {}) {
  return { get: (variable) => (variable in vars ? { value: vars[variable] } : void 0) };
}

/** Drive one request through the real adapter and drain whatever comes back. */
async function streamOnce(profile, provider, model = "probe-model", options = {}) {
  const adapter = new PiAiAdapter({
    profiles: () => new Map([[provider, profile]]),
    resolveApiKey: () => Promise.resolve("probe-key"),
  });
  // The response body is not under test — a parse or shape complaint still
  // proves the request reached the endpoint, which is what is being asserted.
  for await (const _chunk of adapter.stream({
    provider,
    model,
    messages: [createUserMessage({ content: [{ type: "text", text: "hi" }], source: { kind: "user" } })],
    ...options,
  })) { /* drain */ }
}

test("a configured user-agent outranks the harness attribution header on the wire", async (t) => {
  const endpoint = await recordingEndpoint();
  t.after(() => endpoint.close());

  const profile = resolveProfile("probe", {
    api: "openai-completions",
    baseURL: endpoint.baseURL,
    apiKeyEnv: "PROBE_API_KEY",
    headers: { "user-agent": CODEBUDDY_UA, "x-product": "SaaS" },
    models: [{ id: "probe-model" }],
  }, env());

  await streamOnce(profile, "probe");

  assert.equal(endpoint.requests.length, 1);
  const { headers } = endpoint.requests[0];

  // The assertion this plugin exists for. Without the provider wrap this reads
  // "deepseek-harness/<version> (+https://github.com/deepseek-ai/deepseek-harness)",
  // which Tencent CodeBuddy answers with 500 {"code":11128,"msg":"request illegal"}.
  assert.equal(headers["user-agent"], CODEBUDDY_UA);
  assert.doesNotMatch(headers["user-agent"], /deepseek-harness/);
  // Node lowercases and comma-joins repeated fields, so a surviving second
  // spelling would show up here as one combined value.
  assert.equal(headers["user-agent"].includes(","), false);

  // A non-reserved header travels the same path and must still arrive.
  assert.equal(headers["x-product"], "SaaS");
  // The harness still authenticates the route the way it always did.
  assert.equal(headers.authorization, "Bearer probe-key");
});

test("a route configuring no headers still sends the harness attribution", async (t) => {
  const endpoint = await recordingEndpoint();
  t.after(() => endpoint.close());

  const profile = resolveProfile("plain", {
    api: "openai-completions",
    baseURL: endpoint.baseURL,
    apiKeyEnv: "PROBE_API_KEY",
    models: [{ id: "probe-model" }],
  }, env());

  await streamOnce(profile, "plain");

  // Nothing here suppresses attribution: a route that asks for no override is
  // identified as the harness, exactly like a stock `llm-pi-ai` route.
  assert.match(endpoint.requests[0].headers["user-agent"], /^deepseek-harness\//);
});

test("an ${env:NAME} header value reaches the wire substituted", async (t) => {
  const endpoint = await recordingEndpoint();
  t.after(() => endpoint.close());

  const profile = resolveProfile("probe", {
    api: "openai-completions",
    baseURL: endpoint.baseURL,
    apiKeyEnv: "PROBE_API_KEY",
    headers: { "x-tenant": "${env:TENANT_ID}", "x-gateway-auth": "Bearer ${env:GATEWAY_TOKEN}" },
    models: [{ id: "probe-model" }],
  }, env({ TENANT_ID: "tenant-42", GATEWAY_TOKEN: "t0k3n" }));

  await streamOnce(profile, "probe");
  const { headers } = endpoint.requests[0];

  assert.equal(headers["x-tenant"], "tenant-42");
  assert.equal(headers["x-gateway-auth"], "Bearer t0k3n");
  // The reference itself must not survive anywhere.
  assert.equal(JSON.stringify(headers).includes("${env:"), false);
});

test("a null header value removes a header the installed catalog puts on the model", async (t) => {
  const endpoint = await recordingEndpoint();
  t.after(() => endpoint.close());

  // pi-ai's nvidia catalog stamps NVCF-POLL-SECONDS onto every model. That is a
  // header no layer above can take back: `createClient` seeds its record from
  // `model.headers` and only merges the request map over, so a name merely
  // absent from the override keeps the catalog's value.
  const route = (headers) => resolveProfile("nvidia", { baseURL: endpoint.baseURL, apiKeyEnv: "PROBE_API_KEY", headers }, env());
  const kept = route({});
  const model = kept.piProvider.getModels().find((entry) => entry.headers?.["NVCF-POLL-SECONDS"] !== void 0);
  assert.ok(model !== void 0, "the nvidia catalog should still carry NVCF-POLL-SECONDS");

  await streamOnce(kept, "nvidia", model.id);
  assert.equal(endpoint.requests.at(-1).headers["nvcf-poll-seconds"], "3600");

  await streamOnce(route({ "NVCF-POLL-SECONDS": null }), "nvidia", model.id);
  const after = endpoint.requests.at(-1).headers;
  assert.equal("nvcf-poll-seconds" in after, false);
  // Removing one header must not disturb the rest of the request.
  assert.equal(after.authorization, "Bearer probe-key");
  assert.match(after["user-agent"], /^deepseek-harness\//);
});

test("removing a header is case-insensitive about how the catalog spelled it", async (t) => {
  const endpoint = await recordingEndpoint();
  t.after(() => endpoint.close());

  const profile = resolveProfile("nvidia", {
    baseURL: endpoint.baseURL,
    apiKeyEnv: "PROBE_API_KEY",
    headers: { "nvcf-poll-seconds": null },
  }, env());
  const model = profile.piProvider.getModels()[0];

  await streamOnce(profile, "nvidia", model.id);

  assert.equal("nvcf-poll-seconds" in endpoint.requests.at(-1).headers, false);
});

test("a per-model header map wins over the route's, and other models keep the route's", async (t) => {
  const endpoint = await recordingEndpoint();
  t.after(() => endpoint.close());

  const profile = resolveProfile("probe", {
    api: "openai-completions",
    baseURL: endpoint.baseURL,
    apiKeyEnv: "PROBE_API_KEY",
    headers: { "user-agent": CODEBUDDY_UA, "x-tier": "shared" },
    models: [
      { id: "probe-model", headers: { "x-tier": "dedicated", "x-extra": "yes" } },
      { id: "other-model" },
    ],
  }, env());

  await streamOnce(profile, "probe", "probe-model");
  const special = endpoint.requests.at(-1).headers;
  // A per-model map inherits the route's and overrides field by field.
  assert.equal(special["user-agent"], CODEBUDDY_UA);
  assert.equal(special["x-tier"], "dedicated");
  assert.equal(special["x-extra"], "yes");

  await streamOnce(profile, "probe", "other-model");
  const ordinary = endpoint.requests.at(-1).headers;
  assert.equal(ordinary["user-agent"], CODEBUDDY_UA);
  assert.equal(ordinary["x-tier"], "shared");
  assert.equal("x-extra" in ordinary, false);
});

test("a pi-ai catalog route carries headers while keeping the catalog's own dispatch", async (t) => {
  const endpoint = await recordingEndpoint();
  t.after(() => endpoint.close());

  // `deepseek` is a route pi-ai ships: the models, protocol, and API
  // implementation come from the installed catalog, and only the endpoint is
  // repointed so the request is observable here.
  const profile = resolveProfile("deepseek", {
    baseURL: endpoint.baseURL,
    apiKeyEnv: "PROBE_API_KEY",
    headers: { "user-agent": "my-gateway/1.0" },
  }, env());

  const [model] = profile.piProvider.getModels();
  assert.ok(model !== void 0, "the installed catalog should supply the models");

  await streamOnce(profile, "deepseek", model.id);
  const { headers } = endpoint.requests.at(-1);

  assert.equal(headers["user-agent"], "my-gateway/1.0");
  assert.equal(headers.authorization, "Bearer probe-key");
});

test("global fetch hook forces user-agent on requests matching route baseURL", async (t) => {
  const endpoint = await recordingEndpoint();
  t.after(() => endpoint.close());

  const { installGlobalFetchHook, setFetchHeaderRules } = await import("../lib/index.js");
  installGlobalFetchHook();
  setFetchHeaderRules([
    { prefix: endpoint.baseURL, headers: { "user-agent": CODEBUDDY_UA } },
  ]);

  const res = await fetch(`${endpoint.baseURL}/chat/completions`, {
    headers: { "user-agent": "deepseek-harness/0.1.2-rc.1", authorization: "Bearer direct-key" },
  });
  await res.text();

  assert.equal(endpoint.requests.length, 1);
  assert.equal(endpoint.requests[0].headers["user-agent"], CODEBUDDY_UA);
  assert.equal(endpoint.requests[0].headers["authorization"], "Bearer direct-key");
});

test("global fetch hook prefers a matching model rule over the route rule", async (t) => {
  const endpoint = await recordingEndpoint();
  t.after(() => endpoint.close());

  const { installGlobalFetchHook, setFetchHeaderRules } = await import("../lib/index.js");
  installGlobalFetchHook();
  setFetchHeaderRules([
    { prefix: endpoint.baseURL, headers: { "x-tier": "shared" } },
    { prefix: endpoint.baseURL, modelId: "special-model", headers: { "x-tier": "dedicated" } },
  ]);

  const request = (model) => fetch(`${endpoint.baseURL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-tier": "upstream" },
    body: JSON.stringify({ model }),
  });
  await (await request("special-model")).text();
  await (await request("other-model")).text();

  assert.equal(endpoint.requests[0].headers["x-tier"], "dedicated");
  assert.equal(endpoint.requests[1].headers["x-tier"], "shared");
});
