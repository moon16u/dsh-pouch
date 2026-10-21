import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import * as cordis from "@deepseek-ai/cordis";

const require = createRequire(import.meta.url);
const officialSource = readFileSync(require.resolve("@deepseek-ai/dsh-client-ui-commands/client"), "utf8");
const restartSource = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

function loadBundle(source) {
  let registration;
  runInNewContext(source, {
    window: { __ModuleLoader__: { load: (spec) => { registration = spec; } } },
    // No browser, network, or real timers are needed for command dispatch.
    AbortController,
    setInterval: () => 0,
    clearInterval() {},
    fetch: async () => ({ ok: true, json: async () => ({ failure: null }) }),
  });
  return registration.factory((id) => {
    if (id === "@deepseek-ai/cordis") return cordis;
    if ([
      "@deepseek-ai/dsh-client-ui-primitives",
      "@deepseek-ai/dsh-client-store",
      "react",
      "react/jsx-runtime",
    ].includes(id)) return {};
    throw new Error(`Unexpected bundle dependency: ${id}`);
  });
}

async function fixture(t, result = { kind: "success", text: "scheduled (test only)" }) {
  const root = new cordis.Context();
  t.after(() => root.fiber.dispose());
  const calls = [];
  const notices = [];
  let source;
  class Remote extends cordis.Service {
    constructor(ctx) { super(ctx, "remote"); }
    $on() { return () => {}; }
  }
  await root.plugin({
    name: "restart-test-services",
    apply(ctx) {
      ctx.provide("locale", {
        register: () => () => {},
        bind: () => (key) => key,
      });
      ctx.provide("conversation", {
        input: { for: () => ({
          notify: (...args) => notices.push(args),
          notices: { set() {} },
        }) },
      });
      ctx.provide("inputTriggers", {
        registerSource: (spec) => { source = spec; return () => {}; },
      });
      ctx.provide("sessions", { scope: () => root });
      new Remote(ctx);
      // Register this separately, like DSH's generated Remote services. A plain
      // `remote: { commands: ... }` object would bypass Cordis's inject guard.
      ctx.provide("remote.commands", {
        execute: async (sessionId, line, attachments) => {
          calls.push({ sessionId, line, attachments });
          return { ok: true, value: { commandId: "test-command", result } };
        },
      });
    },
  });
  await root.plugin(loadBundle(officialSource));
  await root.plugin(loadBundle(restartSource));
  assert.ok(source, "the real CommandUi must register its slash source");
  return { root, calls, notices, source };
}

test("real Cordis and official CommandUi admit both restart spellings", async (t) => {
  const f = await fixture(t);
  for (const line of ["/restart", "/dsh-restart"]) {
    const result = await f.root.commandUi.execute({ sessionId: "chat-a" }, line, []);
    assert.equal(result.kind, "success", result.text);
  }
  assert.deepEqual(f.calls.map(({ line }) => line), ["/restart", "/dsh-restart"]);
  assert.equal(f.calls[0].sessionId, "chat-a");
  assert.deepEqual(f.notices, []);
});

test("the official slash-menu source reaches Remote through the restart wrapper", async (t) => {
  const f = await fixture(t);
  assert.equal(f.source.onPick({
    candidate: { name: "restart" },
    session: { sessionId: "chat-menu" },
    span: { start: 0, end: 8 },
  }), "handled");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.calls.length, 1, JSON.stringify(f.notices));
  assert.equal(f.calls[0].sessionId, "chat-menu");
  assert.equal(f.calls[0].line, "/restart");
  assert.deepEqual(f.notices, []);
});

test("official handler errors remain visible without a duplicate Remote call", async (t) => {
  const f = await fixture(t, { kind: "error", text: "EACCES: helper write failed" });
  const result = await f.root.commandUi.execute({ sessionId: "chat-a" }, "/restart", []);
  assert.equal(result.kind, "error");
  assert.match(result.text, /EACCES: helper write failed/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.notices.length, 1);
  assert.match(f.notices[0][1], /EACCES: helper write failed/);
});
