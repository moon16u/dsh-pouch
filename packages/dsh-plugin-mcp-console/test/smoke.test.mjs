import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveMcpClient, resolutionBases } from "../lib/clientAdapter.js";
import { Orchestrator } from "../lib/orchestrator.js";
import { Store } from "../lib/store.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pouchRoot = join(root, "..", "..");

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
  assert.match(sections[0].text, /MCP 服务器/);
  assert.match(sections[0].text, /mcp__/);
  assert.match(sections[0].text, /dsh-mcp\.json/);
});

test("client bundle is a ModuleLoader payload registering the settings section", async () => {
  const source = await readFile(join(root, "lib/client.js"), "utf8");
  assert.match(source, /window\.__ModuleLoader__\.load\(\{/);
  assert.match(source, /id:\s*"@moon16u\/dsh-plugin-mcp-console"/);
  assert.match(source, /"settings\.section"/);
  assert.match(source, /"mcp-console"/);
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
  assert.match(source, /settings\.plugin\.item/);
  assert.match(source, /McpPluginCard/);
  assert.match(source, /mcp-plugin-card/);
  assert.match(source, /namespace: "mcp-console"/);
  // the old session-header pill must not come back
  assert.doesNotMatch(source, /conversation\.session\.header\.utilities/);
  assert.doesNotMatch(source, /react-dom/);
});

test("client body is synced verbatim into the dsh-pouch root bundle", async () => {
  const standalone = await readFile(join(root, "lib/client.js"), "utf8");
  const rootBundle = await readFile(join(pouchRoot, "lib/client.js"), "utf8");
  const START = "// ==== mcp-console client body";
  const END = "// ==== end mcp-console client body ====";
  function body(text) {
    const a = text.indexOf(START);
    const b = text.indexOf(END);
    assert.ok(a !== -1 && b !== -1 && b > a, "sync markers missing");
    return text.slice(a, b + END.length);
  }
  assert.equal(body(standalone), body(rootBundle));
  // root-only wiring must call the console apply
  assert.match(rootBundle, /mcpConsoleApply\(ctx\);/);
});

test("root client bundle has no stray react-dom require", async () => {
  const rootBundle = await readFile(join(pouchRoot, "lib/client.js"), "utf8");
  assert.doesNotMatch(rootBundle, /require\("react-dom"\)/);
});

test("package.json points to runtime bundles", async () => {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "@moon16u/dsh-plugin-mcp-console");
  assert.equal(pkg.exports["."].default, "./lib/index.js");
  assert.equal(pkg.exports["./client"].default, "./lib/client.js");
  assert.equal(pkg.dsh.client.platform, "web");
  // standalone-bundle protocol: a patch file + its declaration + engines
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
  assert.match(pkg.engines.node, />=20/);
  assert.ok(pkg.files.includes("cordis.patch.yml"));
  const patch = await readFile(join(root, "cordis.patch.yml"), "utf8");
  assert.match(patch, /@moon16u\/dsh-plugin-mcp-console/);
});

test("pouch root registers the mcp-console host plugin", async () => {
  const source = await readFile(join(pouchRoot, "lib/index.js"), "utf8");
  assert.match(source, /packages\/dsh-plugin-mcp-console\/lib\/index\.js/);
  assert.match(source, /ctx\.plugin\(mcpConsole\)/);
});

test("pouch root package.json exports mcp-console subpaths", async () => {
  const pkg = JSON.parse(await readFile(join(pouchRoot, "package.json"), "utf8"));
  assert.equal(pkg.exports["./mcp-console"], "./packages/dsh-plugin-mcp-console/lib/index.js");
  assert.equal(pkg.exports["./mcp-console/client"], "./packages/dsh-plugin-mcp-console/lib/client.js");
});

test("resolveMcpClient finds the official client from a profile tree", { skip: process.env.DSH_PROFILE_CLIENT_TEST === "0" }, async () => {
  // Build an isolated fake DSH_HOME with a profiles/node_modules tree that
  // resolves the REAL official client (peer dep of this workspace), so the
  // dynamic-resolution path is exercised without depending on the host's
  // ~/.dsh — CI runners have none.
  const { mkdtempSync, mkdirSync, symlinkSync, rmSync, existsSync, readlinkSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { createRequire } = await import("node:module");
  const selfRequire = createRequire(new URL("../lib/index.js", import.meta.url));
  const clientDir = path.dirname(selfRequire.resolve("@deepseek-ai/dsh-mcp-client"));
  const home = mkdtempSync(join(os.tmpdir(), "mcp-console-res-"));
  const hoisted = path.join(home, "profiles", "node_modules", "@deepseek-ai");
  mkdirSync(hoisted, { recursive: true });
  symlinkSync(clientDir, path.join(hoisted, "dsh-mcp-client"), "dir");

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
    rmSync(home, { recursive: true, force: true });
  }
});

test("resolutionBases is empty on a host without profiles", () => {
  const bases = resolutionBases("/nonexistent-dsh-home-" + Date.now());
  assert.deepEqual(bases, []);
});

test("orchestrator precheck rejects bad, duplicate and external names", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = mkdtempSync(join(os.tmpdir(), "mcp-console-orch-"));
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
  rmSync(dir, { recursive: true, force: true });
});

test("toolsOf attributes prefix matches and drops concurrently-captured foreign tools", () => {
  const registryEntries = [
    ["cb1", { name: "mcp-client", fibers: [{ config: { serverName: "firecrawl" } }] }],
  ];
  const fakeCtx = {
    registry: { entries: () => registryEntries[Symbol.iterator]() },
    tools: {
      schemas: () => [
        { name: "mcp__everything__echo" },
        { name: "mcp__everything__some_extremely_long_tool_name_aaaaaaaaaaaaa" },
        { name: "mcp__firecrawl__scrape" },
      ],
    },
    plugin: () => {
      throw new Error("not in this test");
    },
    logger: { warn() {}, error() {} },
  };
  const orchestrator = new Orchestrator(fakeCtx, {
    globalStore: new Store(join("/tmp", "mcp-console-unwritable", "dsh-mcp.json")),
    onChange: () => {},
  });
  // the load diff captured a foreign tool too (boot-time concurrency race)
  orchestrator.ledger.set("everything", {
    fiber: null,
    config: {},
    toolNames: new Set(["mcp__everything__some_extremely_long_tool_name_aaaaaaaaaaaaa", "mcp__firecrawl__scrape"]),
    error: null,
    pending: false,
    loadedAt: Date.now(),
  });
  const tools = orchestrator.toolsOf("everything");
  // own prefix match kept, own hash-suffixed name kept (diff), foreign tool dropped
  assert.deepEqual(tools, [
    "mcp__everything__echo",
    "mcp__everything__some_extremely_long_tool_name_aaaaaaaaaaaaa",
  ]);
});
