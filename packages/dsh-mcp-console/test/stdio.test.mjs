import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Context } from "@deepseek-ai/cordis";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import { Store } from "../lib/store.js";
import { Orchestrator } from "../lib/orchestrator.js";
import { tempDir } from "./helpers/temp.mjs";

async function checkStdioFixture(t, linked = false) {
  const fixture = tempDir("stdio space \u6708\u89c1 #");
  const directory = linked ? join(fixture, "linked cwd") : fixture;
  if (linked) {
    const target = join(fixture, "physical cwd");
    mkdirSync(target);
    symlinkSync(target, directory, process.platform === "win32" ? "junction" : "dir");
  }
  const script = join(directory, "fixture server.mjs");
  copyFileSync(new URL("./fixtures/stdio-server.mjs", import.meta.url), script);
  const root = new Context();
  const store = new Store(join(directory, "store.json"));
  const orchestrator = new Orchestrator(root, { globalStore: store, ingestProfile: false });
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = join(directory, "isolated-home");
  t.after(async () => {
    try {
      await orchestrator.close();
      await root.fiber.dispose();
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previousHome;
    }
  });
  const require = createRequire(import.meta.url);
  const toolsRequire = createRequire(require.resolve("@deepseek-ai/dsh-tools"));
  const { default: SystemPrompt } = await import(pathToFileURL(toolsRequire.resolve("@deepseek-ai/dsh-system-prompt")).href);
  await root.plugin(SystemPrompt);
  await root.plugin(ToolRuntime);
  assert.ok(root.get("tools"), "the official ToolRuntime dependency must be active");
  const args = [script, "argument with spaces", "C:\\Data\\a b"];
  store.mutate(servers => {
    servers.native_fixture = {
      transport: "stdio", command: process.execPath, args, cwd: directory,
      enabled: true, failOnStartupError: true, reconnect: { enabled: false },
    };
  });
  await orchestrator.bootstrap();
  assert.equal(orchestrator.clientError, null);
  assert.equal(orchestrator.ledger.get("native_fixture")?.error, null);
  assert.deepEqual(orchestrator.toolsOf("native_fixture"), ["mcp__native_fixture__echo"]);
  const started = JSON.parse(readFileSync(join(directory, "started.json"), "utf8"));
  // macOS may report /private/var for a configured /var temporary directory.
  assert.equal(realpathSync(started.cwd), realpathSync(directory));
  assert.deepEqual(started.args, args.slice(1));
  await orchestrator.setEnabled("native_fixture", false);
  assert.deepEqual(orchestrator.toolsOf("native_fixture"), []);
  assert.equal(store.read().servers.native_fixture.enabled, false);
  await orchestrator.setEnabled("native_fixture", true);
  assert.deepEqual(orchestrator.toolsOf("native_fixture"), ["mcp__native_fixture__echo"]);
  assert.equal(store.read().servers.native_fixture.enabled, true);
}

test("official MCP client starts and toggles a native stdio fixture with spaced paths", { timeout: 15000 }, (t) => checkStdioFixture(t));
test("official MCP client accepts a symlinked stdio working directory", { timeout: 15000 }, (t) => checkStdioFixture(t, true));
