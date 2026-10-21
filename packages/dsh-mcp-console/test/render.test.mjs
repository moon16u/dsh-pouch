import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
/** Load declared dev dependencies, independent of pnpm's store layout. */
function loadReactModules() {
  const require = createRequire(import.meta.url);
  return { react: require("react"), reactDomServer: require("react-dom/server") };
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

test("standalone bundle McpSection renders without crashing", async () => {
  const { react, reactDomServer } = loadReactModules();
  const bundle = await loadBundle(join(here, "..", "lib", "client.js"), react);
  assert.equal(typeof bundle.McpSection, "function");
  const t = (key) => `en:${key}`;
  const html = reactDomServer.renderToStaticMarkup(react.createElement(bundle.McpSection, { t }));
  assert.match(html, /en:title/);
  assert.match(html, /data-mcp-console-section/);
  assert.doesNotMatch(html, /data-mcp-plugin-card|mcp-plugin-body|en:pluginCard/);
});

test("all console UI is on the Plugins page, with announcement only", async () => {
  const { react, reactDomServer } = loadReactModules();
  const bundle = await loadBundle(join(here, "..", "lib", "client.js"), react);
  const scope = fakeScope({ status: "ready", value: { announceToAgent: true }, writable: true });
  const html = reactDomServer.renderToStaticMarkup(react.createElement(bundle.McpPluginCard, {
    t: key => key, scope, view: "page",
  }));
  assert.match(html, /data-mcp-console-section/);
  assert.match(html, /pluginCardAnnounce/);
  assert.match(html, /handoffNotice/);
  assert.match(html, /class="mcp-console-page"/);
  assert.match(html, /<details class="mcp-handoff">/);
  assert.match(html, /<summary class="mcp-handoff-summary">/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.doesNotMatch(html, /pluginCardEnabled|data-mcp-plugin-card|mcp-plugin-header/);
  const source = await readFile(join(here, "..", "lib", "client.js"), "utf8");
  assert.doesNotMatch(source, /"settings\.section"|pluginCardEnabled|sectionOffline/);
  assert.match(bundle.mcpDictionaries.zh.pluginCardAnnounceHelp, /直接编辑.*dsh-mcp\.json/);
  assert.match(bundle.mcpDictionaries.en.pluginCardAnnounceHelp, /edit dsh-mcp\.json directly/);
});

// The web module loader hands `unwrapExports()` straight to `ctx.registry.plugin()`,
// which resolves a plugin by its `apply` method. A bundle exporting only the
// prefixed aliases (`mcpConsoleApply`/`mcpInject`) fails the whole frontend boot
// with `invalid plugin, expect function or object with an "apply" method`.
test("standalone bundle declares the entry identity the loader needs", async () => {
  const { react } = loadReactModules();
  const bundle = await loadBundle(join(here, "..", "lib", "client.js"), react);
  assert.equal(typeof bundle.apply, "function");
  assert.ok(Array.isArray(bundle.inject));
  assert.equal(bundle.apply, bundle.mcpConsoleApply);
  assert.deepEqual(bundle.inject, bundle.mcpInject);
});

test("server card renders the test button and every probe outcome", async () => {
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

test("read-only external server cards hide the test button", async () => {
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

test("plugin card renders the master switches honestly", async () => {
  const { react, reactDomServer } = loadReactModules();
  const bundle = await loadBundle(join(here, "..", "lib", "client.js"), react);
  assert.equal(typeof bundle.McpPluginCard, "function");
  assert.equal(typeof bundle.McpPluginCardFields, "function");
  const templates = {
    pluginCardTitle: "MCP console",
    pluginCardDesc: "Visual management",
    pluginCardLoading: "Loading…",
    pluginCardUnavailable: "not exposed",
    pluginCardExpand: "Expand settings",
  };
  const t = (key) => templates[key] ?? `k:${key}`;
  const render = (scope) => reactDomServer.renderToStaticMarkup(
    react.createElement(bundle.McpPluginCardFields, { t, scope }),
  );

  // loading and unavailable are honest one-liners
  assert.match(render(fakeScope({ status: "loading" })), /Loading…/);
  assert.match(render(fakeScope({ status: "unavailable" })), /not exposed/);

  // Both switches reflect resolved values without extra override controls.
  const html = render(fakeScope({
    status: "ready",
    value: { enabled: true, announceToAgent: false },
    user: { announceToAgent: false },
    revision: 3,
    writable: true,
    mode: "host",
  }));
  assert.doesNotMatch(html, /k:pluginCardEnabled/);
  assert.match(html, /k:pluginCardAnnounce/);
  assert.equal((html.match(/role="switch"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 0);
  assert.equal((html.match(/aria-checked="false"/g) ?? []).length, 1);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.doesNotMatch(html, /mcp-plugin-badge|mcp-plugin-reset|pluginCardOverridden|pluginCardReset/);

  // Explicit values and defaults render identically when their values match.
  const pristine = render(fakeScope({
    status: "ready", value: { enabled: true, announceToAgent: true }, user: {}, revision: 0, writable: true, mode: "host",
  }));
  const explicit = render(fakeScope({
    status: "ready", value: { enabled: true, announceToAgent: true },
    user: { enabled: true, announceToAgent: true }, revision: 1, writable: true, mode: "host",
  }));
  assert.equal(pristine, explicit);
  assert.equal((explicit.match(/<button/g) ?? []).length, 1);
  assert.equal((explicit.match(/aria-checked="true"/g) ?? []).length, 1);

  // read-only scope: switches render disabled
  const readonly = render(fakeScope({
    status: "ready", value: { enabled: true, announceToAgent: true }, user: {}, revision: 0, writable: false, mode: "host",
  }));
  assert.match(readonly, /disabled/);
});

test("the offline rule and both dictionaries stay in step", async () => {
  const { react } = loadReactModules();
  const bundle = await loadBundle(join(here, "..", "lib", "client.js"), react);

  assert.equal(bundle.mcpConsoleOffline, undefined, "404 is no longer mislabeled as a user-disabled console");
  // a key present in one language only would render as a raw key in the UI
  const { zh, en } = bundle.mcpDictionaries;
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const key of ["handoffNotice", "pluginCardAnnounce"]) {
    assert.equal(typeof zh[key], "string", `zh is missing ${key}`);
    assert.equal(typeof en[key], "string", `en is missing ${key}`);
  }
});

test("per-tool toggles keep stored restrictions of a down server", async () => {
  const { react } = loadReactModules();
  const bundle = await loadBundle(join(here, "..", "lib", "client.js"), react);
  const next = bundle.mcpNextDisabledTools;
  assert.equal(typeof next, "function");
  // Rebuilding from the live list erased stored restrictions whenever the
  // server was down and therefore exposed no tools at all.
  const down = { name: "github", disabledTools: ["mcp__github__echo", "mcp__github__list"] };
  const sorted = (list) => [...list].sort();
  assert.deepEqual(sorted(next(down, { name: "mcp__github__echo", enabled: false })), ["mcp__github__list"]);
  assert.deepEqual(sorted(next(down, { name: "mcp__github__echo", enabled: true })), ["mcp__github__echo", "mcp__github__list"]);
  // A disabled tool that has since disappeared from the live list stays off.
  const live = { disabledTools: ["mcp__x__gone"], tools: [] };
  assert.deepEqual(sorted(next(live, { name: "mcp__x__fresh", enabled: true })), ["mcp__x__fresh", "mcp__x__gone"]);
  // No stored list at all: a plain enable/disable still works.
  assert.deepEqual(next({}, { name: "mcp__x__t", enabled: true }), ["mcp__x__t"]);
});

test("the plugin card answers the Plugins page view contract", async () => {
  const { react, reactDomServer } = loadReactModules();
  const bundle = await loadBundle(join(here, "..", "lib", "client.js"), react);
  const t = (key) => (key === "pluginCardDesc" ? "Console description" : key);
  const scope = fakeScope({ status: "ready", value: { enabled: true, announceToAgent: true }, user: {}, writable: true });
  // summary: the card's one-liner — the owner already draws the frame, so
  // rendering our own card here nested a whole card inside the description.
  const summary = reactDomServer.renderToStaticMarkup(react.createElement(bundle.McpPluginCard, { t, scope, view: "summary" }));
  assert.equal(summary, "Console description");
  assert.doesNotMatch(summary, /mcp-plugin-card/);
  // page: just the switch body, again without our own card chrome
  const page = reactDomServer.renderToStaticMarkup(react.createElement(bundle.McpPluginCard, { t, scope, view: "page" }));
  assert.match(page, /mcp-plugin-body/);
  assert.equal((page.match(/role="switch"/g) ?? []).length, 1);
  assert.doesNotMatch(page, /mcp-plugin-card/);
  assert.doesNotMatch(page, /mcp-plugin-chevron/);
  // Without view props the complete page renders, never a nested card.
  const standalone = reactDomServer.renderToStaticMarkup(react.createElement(bundle.McpPluginCard, { t, scope }));
  assert.match(standalone, /data-mcp-console-section/);
  assert.doesNotMatch(standalone, /data-mcp-plugin-card/);
});
