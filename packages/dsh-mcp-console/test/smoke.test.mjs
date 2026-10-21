import { tempDir, recoverTempDir } from "./helpers/temp.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveMcpClient, resolutionBases } from "../lib/clientAdapter.js";
import { Orchestrator } from "../lib/orchestrator.js";
import { Store, globalStorePath } from "../lib/store.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

test("host entry exports the cordis plugin face", async () => {
  const mod = await import("../lib/index.js");
  assert.equal(mod.name, "mcp-console");
  assert.equal(typeof mod.apply, "function");
  assert.equal(typeof mod.ingestProfileMcpEntries, "function");
  assert.equal(typeof mod.exportStoreToProfileYaml, "function");
});

test("apply registers a system-prompt announcement behind its own inject scope", async () => {
  const { apply } = await import("../lib/index.js");
  const sections = [];
  const injectedScopes = [];
  const fakeSystemPromptScope = {
    systemPrompt: {
      section: (section) => {
        sections.push(section);
        return () => {};
      },
    },
  };
  const fakeCtx = {
    // only the systemPrompt scope is activated; the webServer/tools scope
    // stays dormant, so no store, registry or filesystem is touched
    inject(names, fn) {
      injectedScopes.push(names);
      if (names.includes("systemPrompt")) fn(fakeSystemPromptScope);
    },
  };
  apply(fakeCtx);
  assert.ok(injectedScopes.some((names) => names.includes("systemPrompt")));
  assert.equal(sections.length, 1);
  assert.equal(sections[0].name, "plugin:mcp-console");
  assert.ok(Number.isFinite(sections[0].order));
  // the guidance tells the model where the console lives and what it does
  assert.match(sections[0].text, /Plugins > Built-in plugin configuration > MCP console/);
  assert.match(sections[0].text, /mcp__/);
  assert.match(sections[0].text, /dsh-mcp\.json/);
  assert.match(sections[0].text, /read and edit/);
  assert.ok(sections[0].text.includes(JSON.stringify(globalStorePath())));
  assert.match(sections[0].text, /POST \/api\/dsh-mcp-console\/refresh/);
  assert.match(sections[0].text, /not an mcpServers import envelope/);
  assert.match(sections[0].text, /Do not edit cordis\.patch\.yml/);
  assert.doesNotMatch(sections[0].text, /guide them to|no need to hand-edit/);
});

test("announcement uses the active profile home instead of a neighboring default", async () => {
  const { apply } = await import("../lib/index.js");
  const home = join(tempDir("announcement"), "profile home");
  let announcement;
  apply({
    get: name => name === "profileContext" ? { home } : undefined,
    inject(names, fn) {
      if (names.includes("systemPrompt")) fn({ systemPrompt: { section: value => { announcement = value.text; } } });
    },
  });
  assert.ok(announcement.includes(JSON.stringify(join(home, "dsh-mcp.json"))));
  assert.match(announcement, /project's \.dsh\/mcp\.json/);
  assert.match(announcement, /never print credentials/);
});

test("client bundle is a ModuleLoader payload registering the settings section", async () => {
  const source = await readFile(join(root, "lib/client.js"), "utf8");
  assert.match(source, /window\.__ModuleLoader__\.load\(\{/);
  assert.match(source, /id:\s*"@moon16u\/dsh-mcp-console"/);
  assert.doesNotMatch(source, /"settings\.section"/);
  assert.match(source, /"ui-mcp-console"/);
  assert.match(source, /api\/dsh-mcp-console/);
  // the mcp-manager-gui-spec panel markers: switch, pills, tooltip
  assert.match(source, /mcp-switch/);
  assert.match(source, /mcp-pill/);
  assert.match(source, /clickToDisable/);
  assert.match(source, /IconRefreshOutline16/);
  assert.match(source, /IconTrashOutline16/);
  // mcp-manager-v1-review: green master switch, name-as-edit entry (no edit
  // button), inline read-only external entries
  assert.match(source, /mcp-switch input:checked ~ \.mcp-switch-track\{background:#10b981\}/);
  assert.match(source, /mcp-mgr-name-btn/);
  assert.doesNotMatch(source, /mcp-mgr-edit/);
  assert.match(source, /profileReadOnly/);
  assert.match(source, /externalServers/);
  // side-fiber probe (borrowed from dsh-skills-mcp-manager): test button,
  // per-card result line, probe API call
  assert.match(source, /IconLinkOutline16/);
  assert.match(source, /\/probe/);
  assert.match(source, /probeOk/);
  assert.match(source, /probeLiveOk/);
  assert.match(source, /mcp-probe/);
  // settings-GUI card (settings.plugin.item keyed "mcp-console"): the plugins
  // tab pairs the host-registered namespace with this browser-side card
  assert.match(source, /plugins\.item/);
  assert.match(source, /McpPluginCard/);
  assert.doesNotMatch(source, /data-mcp-plugin-card/);
  assert.match(source, /configForms\.get\("ui-mcp-console"\)/);
  // the old session-header pill must not come back
  assert.doesNotMatch(source, /conversation\.session\.header\.utilities/);
  assert.doesNotMatch(source, /react-dom/);
});

test("package.json points to runtime bundles", async () => {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "@moon16u/dsh-mcp-console");
  assert.equal(pkg.repository.directory, "packages/dsh-mcp-console");
  assert.equal(pkg.exports["."].default, "./lib/index.js");
  assert.equal(pkg.exports["./client"].default, "./lib/client.js");
  assert.equal(pkg.dsh.client.platform, "web");
  // standalone-bundle protocol: a patch file + its declaration + engines
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
  assert.match(pkg.engines.node, />=20/);
  assert.ok(pkg.files.includes("cordis.patch.yml"));
  const patch = await readFile(join(root, "cordis.patch.yml"), "utf8");
  assert.match(patch, /@moon16u\/dsh-mcp-console/);
});

test("package self-reference and handoff share the renamed package identity", async () => {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const host = await import("../lib/index.js");
  const self = await import("@moon16u/dsh-mcp-console");
  const { CONSOLE_PACKAGE, OWNER_PRESENT } = await import("../lib/handoff.js");
  assert.equal(self.apply, host.apply);
  assert.equal(CONSOLE_PACKAGE, pkg.name);
  assert.ok(OWNER_PRESENT.includes(JSON.stringify(pkg.name)));
});

test("resolveMcpClient finds the official client from a profile tree", { skip: process.env.DSH_PROFILE_CLIENT_TEST === "0" }, async () => {
  // Build an isolated fake DSH_HOME with a profiles/node_modules tree that
  // resolves the REAL official client (peer dep of this workspace), so the
  // dynamic-resolution path is exercised without depending on the host's
  // ~/.dsh — CI runners have none.
  const { mkdirSync, symlinkSync, existsSync, readlinkSync } = await import("node:fs");
  const path = await import("node:path");
  const { createRequire } = await import("node:module");
  const selfRequire = createRequire(new URL("../lib/index.js", import.meta.url));
  const clientDir = path.dirname(selfRequire.resolve("@deepseek-ai/dsh-mcp-client/package.json"));
  const home = tempDir("mcp-console-res");
  const hoisted = path.join(home, "profiles", "node_modules", "@deepseek-ai");
  mkdirSync(hoisted, { recursive: true });
  symlinkSync(clientDir, path.join(hoisted, "dsh-mcp-client"), process.platform === "win32" ? "junction" : "dir");

  try {
    const bases = resolutionBases(home);
    assert.ok(
      bases.some((base) => base.endsWith(join("profiles", "node_modules"))),
      JSON.stringify(bases),
    );
    // the hoisted base resolves to the real client module
    const req = createRequire(path.join(path.join(home, "profiles", "node_modules"), "anchor.js"));
    const resolved = req.resolve("@deepseek-ai/dsh-mcp-client");
    assert.ok(existsSync(resolved));
    assert.ok(readlinkSync(path.join(hoisted, "dsh-mcp-client")).length > 0);
    // and importing through it yields the official plugin face
    const { pathToFileURL } = await import("node:url");
    const client = await import(pathToFileURL(resolved).href);
    assert.equal(client.name, "mcp-client");
    assert.deepEqual(client.inject, ["tools"]);
    assert.equal(typeof client.apply, "function");
    assert.ok(client.Config != null, "official client exports a Config schema");
  } finally {
    recoverTempDir(home);
  }
});

test("resolutionBases is empty on a host without profiles", () => {
  const bases = resolutionBases("/nonexistent-dsh-home-" + Date.now());
  assert.deepEqual(bases, []);
});

test("orchestrator precheck rejects bad, duplicate and external names", async () => {
  const path = await import("node:path");
  const dir = tempDir("mcp-console-orch");
  const store = new Store(join(dir, "dsh-mcp.json"));
  const registryEntries = [
    ["cb1", { name: "mcp-client", fibers: [{ config: { serverName: "external-one" } }] }],
    ["cb2", { name: "other", fibers: [{ config: { serverName: "nope" } }] }],
  ];
  const fakeCtx = {
    registry: { entries: () => registryEntries[Symbol.iterator]() },
    tools: { schemas: () => [] },
    plugin: () => {
      throw new Error("not in this test");
    },
    logger: { warn() {}, error() {} },
  };
  const orchestrator = new Orchestrator(fakeCtx, { globalStore: store, onChange: () => {} });
  assert.match(orchestrator.precheck("bad name"), /must match/);
  assert.equal(orchestrator.precheck("fresh"), null);
  // ledger entries shadow the registry scan and are excluded from external
  orchestrator.ledger.set("mine", {});
  assert.match(orchestrator.precheck("mine"), /already managed/);
  assert.ok(orchestrator.externalServerNames().has("external-one"));
  assert.ok(!orchestrator.externalServerNames().has("mine"));
  recoverTempDir(dir);
});

test("toolsOf attributes prefix matches only and never touches the ledger tool list", () => {
  // Attribution must be a pure function of the naming contract. A tool that
  // is NOT `mcp__everything__*` never belongs to the server, no matter what
  // registered it: another MCP server's tool, or a host plugin tool such as
  // `sidebar_open` that landed in the same boot window. (The old load-time
  // registry diff captured exactly those and showed the foreign tool as the
  // server's 29th.)
  const registryEntries = [
    ["cb1", { name: "mcp-client", fibers: [{ config: { serverName: "firecrawl" } }] }],
  ];
  const toolNames = [
    "mcp__everything__echo",
    "mcp__everything__some_extremely_long_tool_name_aaaaaaaaaaaaa",
    "mcp__firecrawl__scrape",
    "sidebar_open",
  ];
  const fakeCtx = {
    registry: { entries: () => registryEntries[Symbol.iterator]() },
    tools: { schemas: () => toolNames.map((name) => ({ name })) },
    plugin: () => {
      throw new Error("not in this test");
    },
    logger: { warn() {}, error() {} },
  };
  const orchestrator = new Orchestrator(fakeCtx, {
    globalStore: new Store(join(tempDir("prefix-filter"), "dsh-mcp.json")),
    onChange: () => {},
  });
  orchestrator.ledger.set("everything", {
    fiber: null,
    config: {},
    error: null,
    pending: false,
    loadedAt: Date.now(),
  });
  const tools = orchestrator.toolsOf("everything");
  // own prefix matches kept (long, truncated names included), everything else dropped
  assert.deepEqual(tools, [
    "mcp__everything__echo",
    "mcp__everything__some_extremely_long_tool_name_aaaaaaaaaaaaa",
  ]);
  // an explicit prefix override is honoured and still filtered
  assert.deepEqual(orchestrator.toolsOf("firecrawl", ["mcp__firecrawl__scrape", "sidebar_open"]), [
    "mcp__firecrawl__scrape",
  ]);
});
