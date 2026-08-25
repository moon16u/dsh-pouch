import assert from "node:assert/strict";
import { test } from "node:test";

import { apply } from "../lib/index.js";

const ROUTE = "codebuddy";

function section(routes) {
  const providers = {};
  for (const route of routes) {
    providers[route] = {
      api: "openai-completions",
      baseURL: "https://example.invalid/v1",
      headers: { "user-agent": "probe/1.0" },
      models: [{ id: "m" }],
    };
  }
  return { providers };
}

/**
 * A host context standing in for the parts of cordis and `ctx.llm` this plugin
 * touches, with an adapter registry that can refuse a route the way the real
 * one does.
 */
function hostStub({ taken = new Set() } = {}) {
  const state = { owned: new Set(), attempts: [], errors: [] };
  const listeners = { "llm/adapters-updated": [] };

  const commit = (routes) => {
    for (const route of routes) {
      if (taken.has(route) && !state.owned.has(route)) {
        const error = new Error(`an adapter for provider "${route}" is already registered`);
        error.code = "DUPLICATE_ADAPTER";
        throw error;
      }
    }
    state.owned = new Set(routes);
    // The real registry emits on every commit; that is what the retry rides.
    for (const listener of [...listeners["llm/adapters-updated"]]) listener();
  };

  const ctx = {
    logger: { error: (value) => state.errors.push(String(value)) },
    effect: (fn) => { fn(); },
    on: (event, listener) => {
      (listeners[event] ??= []).push(listener);
      return () => {};
    },
    get: () => undefined,
    llm: {
      registerAdapter: (routes) => {
        state.attempts.push([...routes]);
        commit(routes);
        const handle = () => {};
        handle.replace = (next) => {
          state.attempts.push([...next]);
          commit(next);
        };
        return handle;
      },
    },
  };

  return {
    state,
    ctx,
    /** Release a route another adapter held, as an edit to its namespace would. */
    release: (route) => {
      taken.delete(route);
      for (const listener of [...listeners["llm/adapters-updated"]]) listener();
    },
  };
}

test("a route refused because another adapter holds it is retried when released", () => {
  const host = hostStub({ taken: new Set([ROUTE]) });
  // Drive the plugin with the route already configured here.
  const captured = [];
  host.ctx.inject = (names, fn) => { captured.push(fn); };
  apply(host.ctx, section([ROUTE]));

  // First attempt loses: the stock adapter still owns the route mid-takeover.
  assert.deepEqual(host.state.attempts, [[ROUTE]]);
  assert.equal(host.state.owned.has(ROUTE), false);
  assert.ok(host.state.errors.length > 0, "the refusal must be reported");

  // The other namespace's edit lands; the registry announces the topology move.
  host.release(ROUTE);

  assert.equal(host.state.owned.has(ROUTE), true, "the route must be picked up on release");
  assert.equal(host.state.attempts.length, 2);
});

test("registration does not loop on its own topology event", () => {
  const host = hostStub();
  host.ctx.inject = () => {};
  apply(host.ctx, section([ROUTE]));

  // One commit, one emit, and the emit must not drive a second commit.
  assert.deepEqual(host.state.attempts, [[ROUTE]]);
  assert.equal(host.state.owned.has(ROUTE), true);

  // A further topology move with nothing outstanding stays a no-op.
  host.release("unrelated");
  assert.equal(host.state.attempts.length, 1);
});

test("a dormant section registers nothing and stays quiet", () => {
  const host = hostStub();
  host.ctx.inject = () => {};
  apply(host.ctx, { providers: {} });

  assert.deepEqual(host.state.attempts, []);
  assert.deepEqual(host.state.errors, []);
});
