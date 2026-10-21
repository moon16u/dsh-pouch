import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { parse, parseDocument } from "yaml";
import { Context } from "@deepseek-ai/cordis";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import * as consolePlugin from "../lib/index.js";
import { resolveMcpClient } from "../lib/clientAdapter.js";
import { CONSOLE_PACKAGE, HANDOFF_ID, handoffBlock, splitHandoff } from "../lib/handoff.js";
import { Store } from "../lib/store.js";
import { formatMcpYamlEntry } from "../lib/yamlMigrator.js";
import { tempDir } from "./helpers/temp.mjs";

const require = createRequire(import.meta.url);
const cordisRequire = createRequire(require.resolve("@deepseek-ai/cordis"));
const { Loader, Group } = await import(pathToFileURL(cordisRequire.resolve("@deepseek-ai/cordis-plugin-loader")).href);
const toolsRequire = createRequire(require.resolve("@deepseek-ai/dsh-tools"));
const { default: SystemPrompt } = await import(pathToFileURL(toolsRequire.resolve("@deepseek-ai/dsh-system-prompt")).href);
const parseRows = raw => parse(raw, { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: value => ({ __jsExpr: value }) }] }).flatMap(row => row.insert ?? []);
const reformatProfile = raw => parseDocument(raw, {
  customTags: [{ tag: "tag:yaml.org,2002:js", resolve: value => value }],
}).toString({ lineWidth: 60 });
const waitFor = async (check, label) => {
  for (let i = 0; i < 150; i++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(label);
};

test("real Loader takeover, tool management, live uninstall, cold uninstall and reinstall", { timeout: 25000 }, async t => {
  const home = tempDir("lifecycle");
  const yaml = join(home, "profile.patch.yml");
  const script = join(home, "native fixture.mjs");
  copyFileSync(new URL("./fixtures/stdio-server.mjs", import.meta.url), script);
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const roots = [];
  const errors = [];
  t.after(async () => {
    for (const root of roots.reverse()) await root.fiber.dispose();
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  });
  const native = await resolveMcpClient();
  const mount = async () => {
    const root = new Context();
    roots.push(root);
    root.logger.error = (...args) => errors.push(args.map(String).join(" "));
    await root.plugin(SystemPrompt);
    await root.plugin(ToolRuntime);
    await root.plugin(Loader);
    let handler;
    await root.plugin({ name: "fixture-web", apply(ctx) {
      ctx.provide("profileContext", { home, patchPath: yaml });
      ctx.provide("webServer", { register(spec) { handler = spec.handler; return () => { handler = undefined; }; } });
    } });
    root.loader.import = async name => name === "cordis:group" ? Group : name === CONSOLE_PACKAGE ? consolePlugin : native;
    return { root, handler: () => handler };
  };
  const config = { transport: "stdio", command: process.execPath, args: [script], cwd: home, enabled: true, reconnect: { enabled: false } };
  writeFileSync(yaml, formatMcpYamlEntry("demo", config) + "\n");
  const owner = () => ({ id: "ui-mcp-console", name: CONSOLE_PACKAGE, config: { enabled: false } });
  const app = await mount();
  await app.root.loader.root.update([owner(), ...parseRows(readFileSync(yaml, "utf8"))]);
  await waitFor(() => readFileSync(yaml, "utf8").includes(HANDOFF_ID) && app.root.tools.schemas().length === 1, "takeover did not complete");
  const stored = new Store(join(home, "dsh-mcp.json"));
  assert.equal(stored.read().servers.demo.command, process.execPath);
  assert.deepEqual(app.root.tools.schemas().map(tool => tool.name), ["mcp__demo__echo"]);

  // A real route call changes tool restrictions in the managed store.
  const { EventEmitter } = await import("node:events");
  const req = new EventEmitter();
  Object.assign(req, { method: "PATCH", url: "/api/dsh-mcp-console/servers/demo", socket: { remoteAddress: "127.0.0.1" }, headers: { host: "localhost:3080" } });
  let status, payload;
  app.handler()(req, { writeHead(code) { status = code; }, end(value) { payload = value; } });
  req.emit("data", Buffer.from(JSON.stringify({ disabledTools: ["mcp__demo__echo"] })));
  req.emit("end");
  await waitFor(() => payload !== undefined, "tool management request did not settle");
  assert.equal(status, 200, payload);
  assert.deepEqual(stored.read().servers.demo.disabledTools, ["mcp__demo__echo"]);
  assert.deepEqual(app.root.tools.schemas().map(tool => tool.name), ["mcp__demo__echo"], "tool discovery remains available after takeover and a per-tool disable");
  const listing = new EventEmitter();
  Object.assign(listing, { method: "GET", url: "/api/dsh-mcp-console/servers", socket: req.socket, headers: req.headers });
  let listed;
  app.handler()(listing, { writeHead() {}, end(value) { listed = JSON.parse(value); } });
  await waitFor(() => listed !== undefined, "managed tool list did not return");
  assert.equal(listed.servers.find(server => server.name === "demo").tools[0].enabled, false);

  // Re-enable the tool through the same route, so native return should run.
  const second = new EventEmitter();
  Object.assign(second, { method: "PATCH", url: req.url, socket: req.socket, headers: req.headers });
  payload = undefined;
  app.handler()(second, { writeHead(code) { status = code; }, end(value) { payload = value; } });
  second.emit("data", Buffer.from(JSON.stringify({ disabledTools: [] })));
  second.emit("end");
  await waitFor(() => payload !== undefined, "tool re-enable did not settle");
  assert.equal(status, 200, payload);

  // Host-side YAML serialization wraps the owner expression without editing it.
  const beforeFormatting = readFileSync(yaml, "utf8");
  writeFileSync(yaml, reformatProfile(beforeFormatting));
  assert.notEqual(readFileSync(yaml, "utf8"), beforeFormatting);

  // Models edit the managed JSON, then refresh the running host. Refresh must
  // update both connections and the native handoff, not merely redraw the UI.
  stored.mutate(servers => { servers.demo.args = [script, "edited-through-json"]; });
  const refresh = new EventEmitter();
  Object.assign(refresh, { method: "POST", url: "/api/dsh-mcp-console/refresh", socket: req.socket, headers: req.headers });
  payload = undefined;
  app.handler()(refresh, { writeHead(code) { status = code; }, end(value) { payload = value; } });
  await waitFor(() => payload !== undefined, "file-edit refresh did not settle");
  assert.equal(status, 200, payload);
  assert.deepEqual(JSON.parse(payload).failed, []);
  assert.match(readFileSync(yaml, "utf8"), /edited-through-json/);
  assert.deepEqual(JSON.parse(readFileSync(join(home, "started.json"), "utf8")).args, ["edited-through-json"]);

  await app.root.loader.root.update(parseRows(readFileSync(yaml, "utf8")));
  await app.root.loader.await();
  await waitFor(() => app.root.tools.schemas().length === 1 && app.handler() === undefined, "live uninstall did not return native MCP");
  assert.deepEqual(app.root.tools.schemas().map(tool => tool.name), ["mcp__demo__echo"]);
  assert.equal(errors.length, 0, errors.join("\n"));
  await app.root.fiber.dispose();
  roots.pop();

  // Fresh host with no console package entry: only native Loader/client code.
  writeFileSync(yaml, reformatProfile(readFileSync(yaml, "utf8")));
  const cold = await mount();
  await cold.root.loader.root.update(parseRows(readFileSync(yaml, "utf8")));
  await cold.root.loader.await();
  await waitFor(() => cold.root.tools.schemas().length === 1, "cold uninstall fallback failed");
  await cold.root.loader.root.update([owner(), ...parseRows(readFileSync(yaml, "utf8"))]);
  await cold.root.loader.await();
  await waitFor(() => cold.root.tools.schemas().length === 1 && cold.handler() !== undefined &&
    splitHandoff(readFileSync(yaml, "utf8")).block === handoffBlock(stored.read().servers), "reinstall takeover failed");
  assert.equal(errors.length, 0, errors.join("\n"));
  const beforeShutdown = readFileSync(yaml, "utf8");
  await cold.root.fiber.dispose();
  roots.pop();
  assert.equal(readFileSync(yaml, "utf8"), beforeShutdown, "ordinary shutdown must not rewrite the handoff or revert configuration");
});
