import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import { Context } from "@deepseek-ai/cordis";
import { HandoffStore, handoffBlock, splitHandoff, CONSOLE_PACKAGE, HANDOFF_ID, releaseHandoffFibers } from "../lib/handoff.js";
import { Orchestrator } from "../lib/orchestrator.js";
import { formatMcpYamlEntry, ingestProfileMcpEntries } from "../lib/yamlMigrator.js";
import { tempDir } from "./helpers/temp.mjs";

const require = createRequire(import.meta.url);
const cordisRequire = createRequire(require.resolve("@deepseek-ai/cordis"));
const { Loader, Group } = await import(pathToFileURL(cordisRequire.resolve("@deepseek-ai/cordis-plugin-loader")).href);
const tags = [{ tag: "tag:yaml.org,2002:js", resolve: value => ({ __jsExpr: value }) }];
const config = { transport: "stdio", command: "node", args: ["server.js"], enabled: true };
const entries = text => parse(text, { customTags: tags }).flatMap(row => row.insert ?? []);

function fixture() {
  const root = tempDir("handoff");
  const yaml = join(root, "cordis.patch.yml");
  return { root, yaml, store: new HandoffStore(join(root, "dsh-mcp.json"), yaml) };
}

test("native handoff preserves latest edits, deletions and unrelated profile content", () => {
  const { yaml, store } = fixture();
  writeFileSync(yaml, "# untouched\n- insert:\n    - id: other\n      name: other\n");
  store.mutate(servers => { servers.demo = config; });
  store.enableHandoff();
  store.mutate(servers => { servers.demo = { ...config, args: ["latest path.js"] }; servers.newone = config; });
  assert.deepEqual(entries(readFileSync(yaml, "utf8")).find(row => row.id === HANDOFF_ID).config[0].config.args, ["latest path.js"]);
  store.mutate(servers => { delete servers.demo; });
  const text = readFileSync(yaml, "utf8");
  assert.ok(text.startsWith("# untouched\n- insert:\n    - id: other\n      name: other\n"));
  assert.deepEqual(entries(text).find(row => row.id === HANDOFF_ID).config.map(row => row.config.serverName), ["newone"]);
  assert.ok(!text.includes("latest path.js"));
});

test("restricted servers return disabled without changing managed restrictions or enablement", () => {
  const { yaml, store } = fixture();
  store.mutate(servers => { servers.demo = { ...config, disabledTools: ["mcp__demo__danger"] }; });
  store.enableHandoff();
  const fallback = entries(readFileSync(yaml, "utf8"))[0].config[0];
  assert.equal(fallback.disabled, true);
  assert.equal(store.read().servers.demo.enabled, true);
  assert.deepEqual(store.read().servers.demo.disabledTools, ["mcp__demo__danger"]);
});

test("no host callback or installed console code is needed for cold uninstall/reinstall", async () => {
  for (const installed of [true, false]) for (const reversed of [false, true]) {
    const root = new Context();
    await root.plugin(Loader);
    const loader = root.loader;
    const running = new Set();
    const native = { name: "mcp-client", apply(ctx, cfg) {
      running.add(cfg.serverName);
      ctx.effect(() => () => running.delete(cfg.serverName));
    } };
    loader.import = async name => {
      if (name === "cordis:group") return Group;
      if (name === CONSOLE_PACKAGE) return { name: "mcp-console", apply() {} };
      if (name === "@deepseek-ai/dsh-mcp-client") return native;
      throw new Error(name);
    };
    let rows = entries(handoffBlock({ demo: config }));
    if (installed) rows = [{ id: "ui-mcp-console", name: CONSOLE_PACKAGE }, ...rows];
    if (reversed) rows.reverse();
    try {
      await loader.root.update(rows);
      await loader.await();
      assert.deepEqual([...running], installed ? [] : ["demo"], `installed=${installed}, reversed=${reversed}`);
    } finally { await root.fiber.dispose(); }
  }
});

test("official Loader activates handoff on live removal and deactivates it on reinstall", async () => {
  const root = new Context();
  await root.plugin(Loader);
  const loader = root.loader;
  const running = new Set();
  const native = { name: "mcp-client", apply(ctx, cfg) {
    running.add(cfg.serverName);
    ctx.effect(() => () => running.delete(cfg.serverName));
  } };
  const owner = { id: "ui-mcp-console", name: CONSOLE_PACKAGE };
  loader.import = async name => name === "cordis:group" ? Group : name === CONSOLE_PACKAGE
    ? { name: "mcp-console", async apply(ctx) { await releaseHandoffFibers(ctx); } } : native;
  try {
    await loader.root.update([{ ...owner }, ...entries(handoffBlock({ demo: config }))]);
    await loader.await();
    // Group updates schedule child disposal through Cordis' update event.
    for (let i = 0; running.size && i < 50; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(running.size, 0);
    await loader.root.update(entries(handoffBlock({ demo: config })));
    await loader.await();
    assert.deepEqual([...running], ["demo"]);
    await loader.root.update([{ ...owner }, ...entries(handoffBlock({ demo: config }))]);
    await loader.await();
    for (let i = 0; running.size && i < 50; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(running.size, 0);
  } finally { await root.fiber.dispose(); }
});

test("takeover ingests existing native configs and ignores its own fallback on refresh", async () => {
  const { yaml, store } = fixture();
  writeFileSync(yaml, formatMcpYamlEntry("demo", { ...config, enabled: false }) + "\n");
  store.prepareHandoff();
  await store.migrate(() => ingestProfileMcpEntries({ store, yamlPath: yaml }));
  store.enableHandoff();
  const first = readFileSync(yaml, "utf8");
  assert.equal(store.read().servers.demo.enabled, false);
  const result = await store.migrate(() => ingestProfileMcpEntries({ store, yamlPath: yaml }));
  assert.deepEqual(result.ingested, []);
  assert.equal(readFileSync(yaml, "utf8"), first);
  writeFileSync(yaml, first + formatMcpYamlEntry("second", { ...config, enabled: false }) + "\n");
  await store.migrate(() => ingestProfileMcpEntries({ store, yamlPath: yaml }));
  assert.deepEqual(Object.keys(store.read().servers), ["demo", "second"]);
});

test("profile conflicts and edited handoff blocks reject mutations without losing either copy", () => {
  const { yaml, store } = fixture();
  store.mutate(servers => { servers.demo = config; });
  store.enableHandoff();
  const before = store.read();
  const edited = readFileSync(yaml, "utf8").replace("command: node", "command: edited");
  writeFileSync(yaml, edited);
  assert.throws(() => store.mutate(servers => { servers.demo = { ...config, args: ["new"] }; }), /changed outside/);
  assert.deepEqual(store.read(), before);
  assert.equal(readFileSync(yaml, "utf8"), edited);
  assert.throws(() => new HandoffStore(store.path, yaml).enableHandoff(), /changed outside/);
  const failed = new HandoffStore(store.path, yaml);
  assert.throws(() => failed.prepareHandoff(), /changed outside/);
  assert.throws(() => failed.mutate(servers => { delete servers.demo; }), /not ready/);
  assert.deepEqual(store.read(), before);
  assert.throws(() => splitHandoff("# ---- MCP console automatic handoff: begin ----"), /damaged/);
});

test("auto-handoff does not create global entries from project stores", () => {
  const { yaml, store } = fixture();
  store.enableHandoff();
  assert.deepEqual(entries(readFileSync(yaml, "utf8"))[0].config, []);
  const fake = { registry: { entries: function* () {} }, tools: { schemas: () => [] } };
  const orchestrator = new Orchestrator(fake, { globalStore: store, ingestProfile: false });
  assert.equal(orchestrator.projectStore, null);
});
