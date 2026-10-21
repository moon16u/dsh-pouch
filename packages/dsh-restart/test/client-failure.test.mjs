import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture({ outcome, rejection, failure, status = 200 } = {}) {
  const notices = [];
  const calls = [];
  const listeners = new Set();
  const intervals = new Set();
  const disposers = [];
  let request;
  let registration;
  const sandbox = {
    window: { __ModuleLoader__: { load: (spec) => { registration = spec; } } },
    AbortController,
    setInterval: (fn) => { intervals.add(fn); return fn; },
    clearInterval: (fn) => intervals.delete(fn),
    fetch: async (_url, init) => {
      request = init;
      return { ok: status === 200, status, json: async () => ({ failure }) };
    },
  };
  runInNewContext(source, sandbox);
  const commandUi = {
    noticeFor: (...args) => notices.push(args),
    consumeVia() {},
    dispatch: () => "original",
    execute: async (session, line, attachments) => {
      calls.push({ session, line, attachments });
      if (rejection) throw rejection;
      for (const listener of listeners) listener(session.sessionId, line.slice(1), outcome);
      // Mirrors the real command UI: the envelope succeeds even on a handler error.
      return { kind: "success" };
    },
  };
  const scope = {
    commandUi,
    effect: (fn) => disposers.push(fn()),
    on: (name, fn) => {
      assert.equal(name, "command/executed");
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const bundle = registration.factory(() => ({}));
  bundle.apply({
    inject: (_names, fn) => fn(scope),
    locale: { bind: () => (key) => ({ fail: "Failed to schedule restart", logs: "Logs" })[key] || key },
  });
  return {
    commandUi, notices, calls, listeners, intervals,
    get request() { return request; },
    dispose: () => disposers.forEach((fn) => fn()),
  };
}

test("typed command shows the host error and does not retry the alias", async () => {
  const f = fixture({ outcome: { kind: "error", text: "EACCES: helper log" } });
  try {
    const result = await f.commandUi.execute({ sessionId: "chat-a" }, "/restart", []);
    assert.equal(result.kind, "error");
    assert.match(result.text, /EACCES: helper log/);
    assert.equal(f.calls.length, 1);
    assert.equal(f.notices.length, 1);
    assert.equal(f.notices[0][0], "chat-a");
    assert.match(f.notices[0][2], /EACCES: helper log/);
    assert.equal(f.listeners.size, 0);
  } finally {
    f.dispose();
  }
});

test("menu dispatch uses the same error path without an unhandled rejection", async () => {
  const f = fixture({ rejection: new Error("RPC disconnected") });
  try {
    const result = f.commandUi.dispatch({ candidate: { name: "restart" }, session: { sessionId: "chat-b" }, span: {} });
    assert.equal(result, "handled");
    await flush();
    assert.equal(f.calls.length, 1);
    assert.equal(f.notices[0][0], "chat-b");
    assert.match(f.notices[0][2], /RPC disconnected/);
    assert.equal(f.listeners.size, 0);
  } finally {
    f.dispose();
  }
});

test("successful and unrelated commands preserve the original result", async () => {
  const f = fixture({ outcome: { kind: "success" } });
  try {
    for (const line of ["/restart", "/dsh-restart", "/restart-other"]) {
      const result = await f.commandUi.execute({ sessionId: "chat-a" }, line, []);
      assert.equal(result.kind, "success");
    }
    assert.equal(f.notices.length, 0);
    assert.equal(f.calls.length, 3);
  } finally {
    f.dispose();
  }
});

test("detached failure poll notifies only the owning session and deduplicates", async () => {
  const f = fixture({ failure: { attemptId: "attempt-a", sessionId: "chat-tool", reason: "exit 23", logPath: "/tmp/schedule.log" } });
  try {
    await flush();
    assert.equal(f.notices.length, 1);
    assert.equal(f.notices[0][0], "chat-tool");
    assert.match(f.notices[0][2], /exit 23/);
    assert.match(f.notices[0][2], /schedule\.log/);
    for (const poll of f.intervals) await poll();
    assert.equal(f.notices.length, 1);
    assert.equal(f.request.credentials, "same-origin");
    assert.equal(f.request.cache, "no-store");
  } finally {
    f.dispose();
  }
  assert.equal(f.intervals.size, 0);
  assert.equal(f.request.signal.aborted, true);
});

test("unavailable endpoints stop polling without inventing a restart failure", async () => {
  for (const status of [401, 404]) {
    const f = fixture({ status });
    await flush();
    assert.equal(f.intervals.size, 0);
    assert.equal(f.notices.length, 0);
    f.dispose();
  }
  const f = fixture({ status: 503 });
  await flush();
  assert.equal(f.notices.length, 0);
  assert.equal(f.intervals.size, 1);
  f.dispose();
});
