import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pouchRoot = join(here, "..", "..", "..");

/**
 * Render regression: materialize the ROOT client bundle exactly the way the
 * browser module loader does and render its McpSection with the real React
 * from the workspace store. This catches "declared outside the sync markers"
 * ReferenceErrors (e.g. the McpIcons crash that shipped a blank section).
 */

const reactPath = join(pouchRoot, "node_modules", ".pnpm", "react@18.2.0", "node_modules", "react");
const reactDomPath = join(pouchRoot, "node_modules", ".pnpm", "react-dom@18.2.0_react@18.2.0", "node_modules", "react-dom");

/** Load react / react-dom from the pnpm store (CJS interop via createRequire). */
function loadReactModules() {
  const reactRequire = createRequire(join(reactPath, "anchor.js"));
  const reactDomRequire = createRequire(join(reactDomPath, "anchor.js"));
  const react = reactRequire("react");
  const reactDomServer = reactDomRequire("react-dom/server");
  return { react, reactDomServer };
}

/**
 * Materialize one bundle exactly the way the browser module loader does.
 * Loaded once per path and memoized: a repeated `import()` of the same
 * data: URL hits the module cache and never re-executes, so the
 * registration capture would silently stay undefined on later calls.
 */
const bundleCache = new Map();

async function loadBundle(sourcePath, react) {
  const cached = bundleCache.get(sourcePath);
  if (cached) return cached;
  const source = await readFile(sourcePath, "utf8");
  let registration;
  globalThis.window = { __ModuleLoader__: { load: (candidate) => { registration = candidate; } } };
  await import("data:text/javascript," + encodeURIComponent(source));
  assert.ok(registration, "bundle must register through __ModuleLoader__.load");
  const requireShim = (id) => {
    if (id === "react") return react;
    if (id === "@deepseek-ai/dsh-client-ui-primitives") {
      return {
        IconRefreshOutline16: () => react.createElement("svg", { "data-icon": "refresh" }),
        IconTrashOutline16: () => react.createElement("svg", { "data-icon": "trash" }),
        IconCloseOutline16: () => react.createElement("svg", { "data-icon": "close" }),
        IconCopyOutline16: () => react.createElement("svg", { "data-icon": "copy" }),
        IconCheckOutline16: () => react.createElement("svg", { "data-icon": "check" }),
        IconPlusOutline16: () => react.createElement("svg", { "data-icon": "plus" }),
        IconLinkOutline16: () => react.createElement("svg", { "data-icon": "link" }),
        IconChevronRightOutline14: () => react.createElement("svg", { "data-icon": "chevron" }),
        IconChevronDownOutline14: (props) => react.createElement("svg", { "data-icon": "chevron-down", className: props?.className }),
      };
    }
    throw new Error(`the bundle required an unexpected module: ${id}`);
  };
  const bundle = registration.factory(requireShim);
  bundleCache.set(sourcePath, bundle);
  return bundle;
}

test("root bundle McpSection renders without crashing", { skip: !existsSync(reactPath) || !existsSync(reactDomPath) }, async () => {
  const { react, reactDomServer } = loadReactModules();
  const bundle = await loadBundle(join(pouchRoot, "lib", "client.js"), react);
  assert.equal(typeof bundle.McpSection, "function");
  const t = (key) => `zh:${key}`;
  const element = react.createElement(bundle.McpSection, { t });
  const html = reactDomServer.renderToStaticMarkup(element);
  // the header must render (title, refresh/add buttons) — a ReferenceError
  // inside the body would throw here instead
  assert.match(html, /zh:title/);
  assert.match(html, /zh:add/);
  assert.match(html, /zh:loadingData/);
  assert.match(html, /data-mcp-console-section/);
});

test("standalone bundle McpSection renders without crashing", { skip: !existsSync(reactPath) || !existsSync(reactDomPath) }, async () => {
  const { react, reactDomServer } = loadReactModules();
  const bundle = await loadBundle(join(here, "..", "lib", "client.js"), react);
  assert.equal(typeof bundle.McpSection, "function");
  const t = (key) => `en:${key}`;
  const html = reactDomServer.renderToStaticMarkup(react.createElement(bundle.McpSection, { t }));
  assert.match(html, /en:title/);
  assert.match(html, /data-mcp-console-section/);
});

test("server card renders the test button and every probe outcome", { skip: !existsSync(reactPath) || !existsSync(reactDomPath) }, async () => {
  const { react, reactDomServer } = loadReactModules();
  const bundle = await loadBundle(join(here, "..", "lib", "client.js"), react);
  assert.equal(typeof bundle.McpServerItem, "function");
  // a fill-capable t(): the real dictionaries use {n}/{ms}/{error} templates
  const templates = {
    test: "Test connection",
    probeBusy: "Testing…",
    probeOk: "ok {n} tools {ms}ms",
    probeLiveOk: "live {n} tools",
    probeLiveFail: "live bad {error}",
    probeFail: "failed {error}",
    toolsEnabled: "{n} tools enabled",
  };
  const t = (key) => templates[key] ?? `k:${key}`;
  const server = { name: "github", status: "running", enabled: true, toolCount: 2, enabledToolCount: 2, tools: [] };
  const render = (probe) => reactDomServer.renderToStaticMarkup(react.createElement(bundle.McpServerItem, {
    t,
    server,
    busy: null,
    open: false,
    probe,
    onToggleOpen: () => {},
    onToggleServer: () => {},
    onToggleTool: () => {},
    onRemove: () => {},
    onProbe: () => {},
    onEdit: () => {},
  }));
  // the test button is always there for a managed server (link icon + label)
  const idle = render(undefined);
  assert.match(idle, /data-icon="link"/);
  assert.match(idle, /Test connection/);
  assert.doesNotMatch(idle, /mcp-probe/);
  // busy
  assert.match(render({ busy: true }), /mcp-probe/);
  assert.match(render({ busy: true }), /Testing…/);
  // fresh handshake success
  assert.match(render({ ok: true, live: false, toolCount: 3, latencyMs: 421, error: null }), /ok 3 tools 421ms/);
  // live-status success / failure
  assert.match(render({ ok: true, live: true, toolCount: 5, latencyMs: null, error: null }), /live 5 tools/);
  assert.match(render({ ok: false, live: true, toolCount: 0, latencyMs: null, error: "no tools" }), /live bad no tools/);
  // fresh handshake failure
  assert.match(render({ ok: false, live: false, toolCount: 0, latencyMs: 900, error: "refused" }), /failed refused/);
});

test("read-only external server cards hide the test button", { skip: !existsSync(reactPath) || !existsSync(reactDomPath) }, async () => {
  const { react, reactDomServer } = loadReactModules();
  const bundle = await loadBundle(join(here, "..", "lib", "client.js"), react);
  const t = (key) => `k:${key}`;
  const html = reactDomServer.renderToStaticMarkup(react.createElement(bundle.McpServerItem, {
    t,
    server: { name: "external-one", readOnly: true, status: "running", enabled: true, toolCount: 1, enabledToolCount: 1, tools: [] },
    busy: null,
    open: false,
    onToggleOpen: () => {},
    onToggleServer: () => {},
    onToggleTool: () => {},
    onRemove: () => {},
    onProbe: () => {},
    onEdit: () => {},
  }));
  assert.doesNotMatch(html, /data-icon="link"/);
  assert.doesNotMatch(html, /mcp-mgr-del/);
});

/** A settings-scope stand-in: fixed snapshot, recording set/unset calls. */
function fakeScope(snapshot) {
  const writes = [];
  return {
    writes,
    snapshot,
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set: (field, value) => {
      writes.push({ kind: "set", field, value });
      return Promise.resolve();
    },
    unset: (field) => {
      writes.push({ kind: "unset", field });
      return Promise.resolve();
    },
  };
}

test("plugin card renders the master switches honestly", { skip: !existsSync(reactPath) || !existsSync(reactDomPath) }, async () => {
  const { react, reactDomServer } = loadReactModules();
  const bundle = await loadBundle(join(here, "..", "lib", "client.js"), react);
  assert.equal(typeof bundle.McpPluginCard, "function");
  assert.equal(typeof bundle.McpPluginCardFields, "function");
  const templates = {
    pluginCardTitle: "MCP console",
    pluginCardDesc: "Visual management",
    pluginCardLoading: "Loading…",
    pluginCardUnavailable: "not exposed",
    pluginCardOverridden: "Customized",
    pluginCardExpand: "Expand settings",
  };
  const t = (key) => templates[key] ?? `k:${key}`;
  const render = (scope) => reactDomServer.renderToStaticMarkup(
    react.createElement(bundle.McpPluginCardFields, { t, scope }),
  );

  // the card itself is a collapsed official-shaped row: header, description,
  // chevron — the switches stay behind the disclosure until it is opened
  const collapsed = reactDomServer.renderToStaticMarkup(
    react.createElement(bundle.McpPluginCard, { t, scope: fakeScope({ status: "ready", value: {}, user: {}, writable: true }) }),
  );
  assert.match(collapsed, /data-mcp-plugin-card/);
  assert.match(collapsed, /data-open="false"/);
  assert.match(collapsed, /aria-expanded="false"/);
  assert.match(collapsed, /aria-label="Expand settings: MCP console"/);
  assert.match(collapsed, /MCP console/);
  assert.match(collapsed, /Visual management/);
  assert.match(collapsed, /mcp-plugin-chevron/);
  assert.doesNotMatch(collapsed, /role="switch"/);

  // loading and unavailable are honest one-liners
  assert.match(render(fakeScope({ status: "loading" })), /Loading…/);
  assert.match(render(fakeScope({ status: "unavailable" })), /not exposed/);

  // ready: both switches render, values from the resolved section; only the
  // overridden field carries the badge, and only then a reset affordance
  const html = render(fakeScope({
    status: "ready",
    value: { enabled: true, announceToAgent: false },
    user: { announceToAgent: false },
    revision: 3,
    writable: true,
    mode: "host",
  }));
  assert.match(html, /k:pluginCardEnabled/);
  assert.match(html, /k:pluginCardAnnounce/);
  assert.equal((html.match(/role="switch"/g) ?? []).length, 2);
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-checked="false"/g) ?? []).length, 1);
  assert.equal((html.match(/Customized/g) ?? []).length, 1);
  assert.equal((html.match(/k:pluginCardReset/g) ?? []).length, 1);

  // no user layer at all: no badge, no reset button
  const pristine = render(fakeScope({
    status: "ready", value: { enabled: true, announceToAgent: true }, user: {}, revision: 0, writable: true, mode: "host",
  }));
  assert.doesNotMatch(pristine, /Customized/);
  assert.doesNotMatch(pristine, /k:pluginCardReset/);

  // read-only scope: switches render disabled
  const readonly = render(fakeScope({
    status: "ready", value: { enabled: true, announceToAgent: true }, user: {}, revision: 0, writable: false, mode: "host",
  }));
  assert.match(readonly, /disabled/);
});

test("the offline rule and both dictionaries stay in step", { skip: !existsSync(reactPath) || !existsSync(reactDomPath) }, async () => {
  const { react } = loadReactModules();
  const bundle = await loadBundle(join(here, "..", "lib", "client.js"), react);

  // only an authenticated 404 on our own prefix means "switched off"; every
  // other failure keeps its message and shows as an API error
  assert.equal(bundle.mcpConsoleOffline(Object.assign(new Error("x"), { status: 404 })), true);
  assert.equal(bundle.mcpConsoleOffline(Object.assign(new Error("x"), { status: 401 })), false);
  assert.equal(bundle.mcpConsoleOffline(Object.assign(new Error("x"), { status: 500 })), false);
  assert.equal(bundle.mcpConsoleOffline(new Error("network down")), false);
  assert.equal(bundle.mcpConsoleOffline(undefined), false);

  // a key present in one language only would render as a raw key in the UI
  const { zh, en } = bundle.mcpDictionaries;
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const key of ["sectionOffline", "sectionOfflineHint", "pluginCardExpand", "pluginCardCollapse"]) {
    assert.equal(typeof zh[key], "string", `zh is missing ${key}`);
    assert.equal(typeof en[key], "string", `en is missing ${key}`);
  }
});
