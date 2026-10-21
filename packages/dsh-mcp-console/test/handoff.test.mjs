import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parse, parseDocument } from "yaml";
import { Context } from "@deepseek-ai/cordis";
import { HandoffStore, handoffBlock, splitHandoff, CONSOLE_PACKAGE, HANDOFF_ID, HANDOFF_BEGIN, HANDOFF_END, releaseHandoffFibers } from "../lib/handoff.js";
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

function reformatHandoff(raw) {
  const doc = parseDocument(raw, { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: value => value }] });
  const group = doc.contents.items[0].get("insert", true).items[0];
  group.items.reverse();
  group.get("config", true).items[0].get("config", true).items.reverse();
  group.commentBefore = " Formatting-only profile edit";
  return doc.toString({ lineWidth: 60 });
}

test("takeover accepts YAML reformatting without changing handoff semantics", () => {
  const { yaml, store } = fixture();
  store.mutate(servers => { servers.demo = config; });
  store.enableHandoff();
  const original = readFileSync(yaml, "utf8");
  const reformatted = reformatHandoff(original).replace(/\n/g, "\r\n");
  assert.notEqual(reformatted, original);
  assert.deepEqual(entries(reformatted), entries(original));
  writeFileSync(yaml, reformatted);
  const restarted = new HandoffStore(store.path, yaml);
  restarted.prepareHandoff();
  assert.equal(readFileSync(yaml, "utf8"), reformatted, "preparation remains read-only");
  restarted.enableHandoff();
  assert.deepEqual(restarted.read(), store.read());
  assert.equal(splitHandoff(readFileSync(yaml, "utf8")).block, handoffBlock(store.read().servers));
});

test("host plugin enablement serialization preserves cold takeover", () => {
  const { yaml, store } = fixture();
  writeFileSync(yaml, "- id: unrelated-plugin\n  disabled: false\n");
  store.mutate(servers => { servers.demo = config; });
  store.enableHandoff();
  const original = readFileSync(yaml, "utf8");
  // Match writePluginEnabled(): edit another entry, then String(document).
  const document = parseDocument(original, { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: value => value }] });
  document.setIn([0, "disabled"], true);
  writeFileSync(yaml, String(document));
  assert.notEqual(splitHandoff(readFileSync(yaml, "utf8")).block, splitHandoff(original).block);
  const restarted = new HandoffStore(store.path, yaml);
  restarted.enableHandoff();
  assert.deepEqual(restarted.read(), store.read());
  assert.deepEqual(parse(readFileSync(yaml, "utf8"), { customTags: tags })[0], { id: "unrelated-plugin", disabled: true });
});

function appendProfileOverrides(raw) {
  const document = parseDocument(raw, { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: value => value }] });
  document.add({ id: "web-search-free", disabled: true, config: { enabled: false } });
  document.add({ id: "web", config: { preset: "compact" } });
  return String(document);
}

test("host-appended overrides stay outside handoff when its end comment moves to EOF", () => {
  for (const newline of ["\n", "\r\n"]) {
    const { yaml, store } = fixture();
    store.mutate(servers => { servers.demo = config; });
    store.enableHandoff();
    const reformatted = appendProfileOverrides(readFileSync(yaml, "utf8")).replace(/\n/g, newline);
    assert.ok(reformatted.indexOf("- id: web") < reformatted.indexOf(HANDOFF_END));
    writeFileSync(yaml, reformatted);
    const split = splitHandoff(reformatted);
    assert.equal(parse(split.block, { customTags: tags }).length, 1);
    assert.deepEqual(parse(split.base), [
      { id: "web-search-free", disabled: true, config: { enabled: false } },
      { id: "web", config: { preset: "compact" } },
    ]);
    const overrides = reformatted.slice(reformatted.indexOf("- id: web"), reformatted.indexOf(HANDOFF_END)).trimEnd();
    assert.ok(split.base.includes(overrides), "unrelated override bytes are preserved");
    const restarted = new HandoffStore(store.path, yaml);
    restarted.prepareHandoff();
    assert.equal(readFileSync(yaml, "utf8"), reformatted, "preparation remains read-only");
    restarted.enableHandoff();
    assert.ok(readFileSync(yaml, "utf8").includes(overrides));
    assert.equal(splitHandoff(readFileSync(yaml, "utf8")).block, handoffBlock(store.read().servers));
  }
});

test("live managed edits preserve overrides inside displaced handoff markers", () => {
  const { yaml, store } = fixture();
  store.mutate(servers => { servers.demo = config; });
  store.enableHandoff();
  writeFileSync(yaml, appendProfileOverrides(readFileSync(yaml, "utf8")));
  store.mutate(servers => { servers.demo.args = ["updated.js"]; });
  const rows = parse(readFileSync(yaml, "utf8"), { customTags: tags });
  assert.deepEqual(rows.slice(0, 2).map(row => row.id), ["web-search-free", "web"]);
  assert.deepEqual(entries(readFileSync(yaml, "utf8")).find(row => row.id === HANDOFF_ID).config[0].config.args, ["updated.js"]);
});

test("handoff extraction preserves comments and siblings on both sides of its group", () => {
  const { yaml, store } = fixture();
  store.mutate(servers => { servers.demo = config; });
  const generated = handoffBlock(store.read().servers);
  const before = "# Before override\n- id: before\n  config: { label: 'keep me' }\n";
  const after = "# After override\n- id: after\n  disabled: true\n";
  const raw = generated.replace(`${HANDOFF_BEGIN}\n`, `${HANDOFF_BEGIN}\n${before}`)
    .replace(HANDOFF_END, `${after}${HANDOFF_END}`) + "\n";
  writeFileSync(yaml, raw);
  store.enableHandoff();
  const published = readFileSync(yaml, "utf8");
  assert.ok(published.includes(before));
  assert.ok(published.includes(after));
  assert.deepEqual(parse(splitHandoff(published).base).map(row => row.id), ["before", "after"]);
});

test("displaced markers do not hide real handoff edits or profile conflicts", () => {
  for (const kind of ["edited group", "conflicting override"]) {
    const { yaml, store } = fixture();
    store.mutate(servers => { servers.demo = config; });
    store.enableHandoff();
    let raw = appendProfileOverrides(readFileSync(yaml, "utf8"));
    if (kind === "edited group") raw = raw.replace("command: node", "command: edited");
    else raw = raw.replace("- id: web-search-free", "- id: mcp-demo");
    writeFileSync(yaml, raw);
    const restarted = new HandoffStore(store.path, yaml);
    assert.throws(() => restarted.enableHandoff(), kind === "edited group" ? /changed outside/ : /conflicts/);
    assert.equal(readFileSync(yaml, "utf8"), raw);
  }
});

test("handoff extraction refuses missing, duplicate and shared-insert ownership", () => {
  const generated = handoffBlock({ demo: config });
  const cases = [
    generated.replace(`id: ${HANDOFF_ID}`, "id: other"),
    generated.replace(HANDOFF_END, `- insert:\n    - id: ${HANDOFF_ID}\n${HANDOFF_END}`),
    generated.replace("    - id: mcp-console-handoff", "    - id: other\n      name: other\n    - id: mcp-console-handoff"),
  ];
  for (const raw of cases) {
    assert.throws(() => splitHandoff(raw), /handoff/i);
  }
});

test("live mutations accept formatting-only changes before and after handoff preparation", () => {
  const { yaml, store } = fixture();
  store.mutate(servers => { servers.demo = config; });
  store.enableHandoff();
  writeFileSync(yaml, reformatHandoff(readFileSync(yaml, "utf8")));
  store.mutate(servers => { servers.demo.args = ["updated.js"]; });
  assert.deepEqual(entries(readFileSync(yaml, "utf8"))[0].config[0].config.args, ["updated.js"]);
  const restarted = new HandoffStore(store.path, yaml);
  restarted.prepareHandoff();
  writeFileSync(yaml, reformatHandoff(readFileSync(yaml, "utf8")));
  restarted.enableHandoff();
  assert.deepEqual(restarted.read().servers.demo.args, ["updated.js"]);
});

test("semantic handoff edits remain rejected even when YAML is reformatted", () => {
  const edits = [
    raw => raw.replace("command: node", "command: edited"),
    raw => raw.replace("disabled: !!js ", "disabled: "),
    raw => raw.replace("rows.some", "rows.every"),
    raw => raw.replace("command: node", "command: &shared node"),
    raw => raw.replace("command: node", "command: node\n              command: edited"),
    raw => raw.replace("transport: stdio", "transport: !unknown stdio"),
    raw => raw.replace("server.js", "changed.js"),
  ];
  for (const edit of edits) {
    const { yaml, store } = fixture();
    store.mutate(servers => { servers.demo = config; });
    store.enableHandoff();
    const before = store.read();
    const reformatted = reformatHandoff(readFileSync(yaml, "utf8"));
    const edited = edit(reformatted);
    assert.notEqual(edited, reformatted, edit.toString());
    writeFileSync(yaml, edited);
    assert.throws(() => new HandoffStore(store.path, yaml).prepareHandoff(), /changed outside/);
    assert.throws(() => store.mutate(servers => { delete servers.demo; }), /changed outside/);
    assert.deepEqual(store.read(), before);
    assert.equal(readFileSync(yaml, "utf8"), edited);
  }
});

test("handoff server and argument sequence order remain significant", () => {
  for (const target of ["servers", "args"]) {
    const { yaml, store } = fixture();
    store.mutate(servers => {
      servers.demo = { ...config, args: ["first.js", "second.js"] };
      servers.other = config;
    });
    store.enableHandoff();
    const original = readFileSync(yaml, "utf8");
    const doc = parseDocument(original, { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: value => value }] });
    const servers = doc.contents.items[0].get("insert", true).items[0].get("config", true);
    const sequence = target === "servers" ? servers : servers.items[0].get("config", true).get("args", true);
    sequence.items.reverse();
    writeFileSync(yaml, doc.toString({ lineWidth: 60 }));
    assert.throws(() => new HandoffStore(store.path, yaml).prepareHandoff(), /changed outside/);
  }
});

test("takeover refuses a stale fallback after an unsynchronized JSON edit", () => {
  const { yaml, store } = fixture();
  store.mutate(servers => { servers.demo = config; });
  store.enableHandoff();
  const original = readFileSync(yaml, "utf8");
  const changed = store.read();
  changed.servers.demo.command = "edited";
  writeFileSync(store.path, JSON.stringify(changed));
  assert.throws(() => new HandoffStore(store.path, yaml).prepareHandoff(), /changed outside/);
  assert.equal(readFileSync(yaml, "utf8"), original);
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
