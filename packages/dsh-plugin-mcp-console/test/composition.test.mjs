import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, renameSync, existsSync } from "node:fs";

import { Context } from "@deepseek-ai/cordis";
import { apply } from "../lib/index.js";

/**
 * The host-side composition must actually register the prefix route on a real
 * Cordis context. A property assignment on the context (`ctx.someResolver =`)
 * is a service registration and throws "cannot set property … without
 * provide"; when that happens the whole composition aborts, the route is never
 * registered, and the settings page falsely reports the console as disabled.
 * This drives apply() for real so that failure mode stays visible.
 */
test("apply registers the console route on a real context", async () => {
  const root = new Context();
  const errors = [];
  root.logger = Object.assign(() => {}, {
    error: (...args) => errors.push(args.map((arg) => arg?.message ?? String(arg)).join(" ")),
    warn: (...args) => errors.push(args.map((arg) => arg?.message ?? String(arg)).join(" ")),
    info() {},
    debug() {},
  });

  const env = mkdtempSync("/tmp/dsh-mcp-console-composition-");
  process.env.DSH_HOME = env;

  const registered = [];
  const webServer = {
    register(spec) {
      registered.push(spec.path);
      return () => {};
    },
  };
  const tools = {
    guard: () => () => {},
    schemas: () => [],
  };
  const provider = root.plugin({
    name: "composition-probe-provider",
    apply(ctx) {
      ctx.provide("webServer", webServer);
      ctx.provide("tools", tools);
    },
  });
  await provider;

  try {
    apply(root, { enabled: true, announceToAgent: false });
    await new Promise((resolve) => setTimeout(resolve, 600));

    assert.deepEqual(errors, [], "the composition must not log a failure");
    assert.ok(
      registered.includes("/api/dsh-mcp-console"),
      `prefix route must be registered, got ${JSON.stringify(registered)}`,
    );
  } finally {
    await root.fiber.dispose();
    delete process.env.DSH_HOME;
    if (existsSync(env)) renameSync(env, `${env}.recovered`);
  }
});
