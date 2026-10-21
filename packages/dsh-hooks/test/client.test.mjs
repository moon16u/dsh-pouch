import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { API } from "../lib/hooks/routes.js";
const manifest = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));
const source = fs.readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
let registration;
const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
const UI = { Modal: "Modal", Button: "Button", Switch: "Switch" };
const React = { createElement: h, Fragment: "Fragment", useState: (value) => [value, () => {}], useRef: () => ({ current: 0 }), useId: () => "test-hook-details", useSyncExternalStore: (_, snapshot) => snapshot(), useEffect() {} };
const browser = { window: { __ModuleLoader__: { load: (value) => { registration = value; } } },
  fetch: () => assert.fail("Unexpected network request") };
vm.runInNewContext(source, browser);
const client = registration.factory((id) => {
  if (id === "react") return React;
  if (id === "@deepseek-ai/dsh-client-ui-primitives") return UI;
  throw new Error(`Unexpected dependency: ${id}`);
});
const entry = { id: "context", key: "entry-key", source: "/project/.dsh/hooks.json", sourceLabel: "project", cwd: "/project",
  event: "SessionStart", command: "printf test", matcher: "startup|resume", timeout: 30, maxOutputBytes: 65536,
  contextBytes: 16384, enabled: true, trusted: false, disabled: false, async: false, subagents: false,
  env: ["TOKEN"], watchFiles: ["context.sh"], hash: "abc", onError: "continue" };
const view = { cwd: "/project", enabled: true, entries: [entry], history: [],
  sources: [{ id: entry.source, label: "project", count: 1 }, { id: "profile:web", label: "profile", count: 0 }] };
const text = (node) => !node ? "" : typeof node !== "object" ? String(node) : node.children.map(text).join(" ");
const all = (node) => !node || typeof node !== "object" ? [] : [node, ...node.children.flatMap(all)];

test("browser entry is approval-only and does not use editable config forms", () => {
  assert.equal(registration.id, manifest.name);
  assert.deepEqual([...client.inject], ["slots", "locale", "remote", "remote.session"]);
  assert.ok(manifest.dsh.client.inject.includes("@deepseek-ai/dsh-api-session-controller"));
  for (const term of ["SettingsForm", "configForms", "HookEditor", "textarea", '"/validate"', '"/execute"']) assert.ok(!source.includes(term), term);
  for (const retired of ["coreDir", "onStartup", "maxBytes", "profileRows", "updateDocument"]) assert.equal(client[retired], undefined);
});
test("browser and server share the renamed API namespace", () => {
  assert.equal(API, "/api/dsh-hooks");
  assert.ok(source.includes(`const API = ${JSON.stringify(API)};`));
  assert.ok(source.includes('const NS = "dsh-hooks";'));
});
test("official slot registers the hook review page", () => {
  let slot; let locale;
  client.apply({ effect: (register) => register(), locale: {
    register: (_, dictionaries) => { locale = dictionaries; return () => {}; }, bind: () => (key) => locale.en[key],
  }, slots: { inject: (_, register) => register(), register: (options, component) => { slot = { options, component }; } } });
  assert.equal(slot.options.id, "dsh-hooks");
  assert.equal(slot.options.label(), "Hooks");
  assert.equal(slot.component, client.HooksPage);
  assert.equal(client.HooksPage({ t: (key) => key, view: "summary" }), "description");
});
test("source cards show only populated or invalid sources and retain workspace identity", () => {
  const cards = client.sourceCards([view, { ...view, cwd: "/other", sources: [{ id: "broken", label: "user", count: 0, error: "bad" }] }]);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].title, "project"); assert.equal(cards[0].entries.length, 1);
  assert.notEqual(cards[0].key, cards[1].key);
});
test("refresh registers in the native detail actions and is scoped only to the hooks page", () => {
  const slots = new Map();
  client.apply({ effect: (register) => register(), locale: { register: () => () => {}, bind: () => (key) => key },
    remote: { session: {} }, slots: { inject: (_, register) => register(), register: (options, component) => slots.set(options.name, { options, component }) } });
  const action = slots.get("plugins.detail.actions");
  assert.equal(action.component, client.RefreshAction);
  const injected = action.options.inject();
  assert.equal(injected.refreshControl, slots.get("plugins.item").options.inject().refreshControl);
  for (const subject of [{ kind: "item", id: "other" }, { kind: "bundle", pkg: { name: "@moon16u/dsh-hooks" } }, { kind: "row" }]) {
    assert.equal(client.RefreshAction({ ...injected, subject }), null);
  }
  assert.equal(client.RefreshAction({ ...injected, subject: { kind: "item", id: "dsh-hooks" } }).type, client.RefreshButton);
});
test("refresh remains outside the source list including empty and error states", () => {
  const original = React.useState;
  for (const views of [[], [view]]) {
    for (const error of ["", "offline"]) {
      const values = [views, null, false, false, error, null];
      React.useState = () => [values.shift(), () => {}];
      try {
        const tree = client.ApprovalPage({ t: (key) => key });
        assert.ok(!all(tree).some((node) => ["wh-refresh", "wh-toolbar"].includes(node.props.className)));
        if (error) assert.ok(all(tree).some((node) => node.props.role === "alert"));
      } finally { React.useState = original; }
    }
  }
});
test("header refresh follows loading, mutation and page-unmount state without duplicate requests", () => {
  const control = client.createRefreshControl(); let requests = 0; let notices = 0;
  const unsubscribe = control.subscribe(() => { notices++; });
  const render = () => client.RefreshButton({ t: (key) => key, refreshControl: control });
  assert.equal(render().props.disabled, true);
  let disconnect = control.connect(() => { requests++; }, false, false);
  assert.equal(render().props["aria-label"], "refresh"); assert.equal(render().props.title, "refresh");
  render().props.onClick(); render().props.onClick(); assert.equal(requests, 1);
  assert.equal(render().props["aria-busy"], true);
  disconnect(); disconnect = control.connect(() => { requests++; }, false, true);
  render().props.onClick(); assert.equal(requests, 1);
  disconnect(); disconnect = control.connect(() => { requests++; }, true, false);
  assert.equal(render().props.disabled, true);
  disconnect(); disconnect = control.connect(() => { requests++; }, false, false);
  assert.equal(render().props.disabled, false);
  disconnect(); assert.equal(render().props.disabled, true);
  const n = notices; unsubscribe(); control.connect(() => {}, false, false); assert.equal(notices, n);
});
test("refresh icon uses thin circular arrows while retaining its accessible button", () => {
  const button = client.RefreshButton({ t: (key) => key, refreshControl: client.createRefreshControl() });
  const svg = all(button).find((node) => node.type === "svg");
  assert.equal(svg.props.width, 18); assert.equal(svg.props.height, 18);
  assert.equal(svg.props.strokeWidth, 1.5); assert.equal(svg.props.fill, "none");
  const arrows = all(svg).filter((node) => node.type === "path");
  assert.equal(arrows.length, 2);
  assert.equal(arrows[0].props.d, "M3 12a9 9 0 0 1 15.36-6.36L21 8m0-5v5h-5");
  assert.equal(arrows[1].props.d, "M21 12a9 9 0 0 1-15.36 6.36L3 16m5 0H3v5");
  assert.equal(button.props["aria-label"], "refresh");
});
test("key configuration fields are read-only and env values only appear during review", () => {
  const normal = client.fields({ ...entry, env: { TOKEN: "private-value" } }, (key) => key);
  assert.ok(!JSON.stringify(normal).includes("private-value"));
  const reviewed = client.fields({ ...entry, env: { TOKEN: "private-value" } }, (key) => key, true);
  assert.ok(JSON.stringify(reviewed).includes("TOKEN=private-value"));
  for (const key of ["event", "command", "matcher", "timeout", "source", "cwd", "hash", "watchFiles"]) assert.ok(normal.some((pair) => pair[0] === key));
  const tree = client.FieldList({ entry, t: (key) => key });
  assert.ok(all(tree).some((node) => node.type === "dl")); assert.ok(all(tree).every((node) => !["input", "textarea", "select"].includes(node.type)));
  const primary = all(tree).find((node) => node.type === "dl");
  assert.deepEqual(all(primary).filter((node) => node.type === "dt").map(text), ["event", "command", "matcher", "timeout"]);
  assert.ok(all(tree).some((node) => node.type === "summary" && text(node) === "more"));
});
test("compact hook row numbers its label and keeps expand separate from permission actions", () => {
  let expanded; const original = React.useState;
  React.useState = () => [false, (value) => { expanded = value; }];
  try {
    const tree = client.HookRow({ entry: { ...entry, trusted: true, statusMessage: "Loading workspace memory" },
      index: 2, card: view, t: (key) => key, onReview: () => assert.fail(), onAction: () => assert.fail() });
    const row = all(tree).find((node) => node.props.className === "wh-row");
    assert.ok(text(row).includes("2 - Loading workspace memory"));
    assert.ok(!text(row).includes("revoke"));
    assert.ok(!text(row).includes("trusted"));
    const disclosure = all(row).find((node) => node.props.className?.includes("wh-expand"));
    assert.equal(disclosure.props["aria-expanded"], false);
    const panel = all(tree).find((node) => node.props.id === disclosure.props["aria-controls"]);
    assert.equal(panel.props.hidden, true);
    disclosure.props.onClick(); assert.equal(expanded, true);
  } finally { React.useState = original; }
});
test("toggle review shows one field list, with more configuration still collapsed", () => {
  let cancelled = false;
  const reviewed = { ...entry, env: { TOKEN: "private-value" } };
  const tree = client.HookRow({ entry, card: view, t: (key) => key, review: { entry: reviewed, nonce: "one-use" }, onCancel: () => { cancelled = true; } });
  const disclosure = all(tree).find((node) => node.props.className?.includes("wh-expand"));
  assert.equal(disclosure.props["aria-expanded"], true);
  assert.equal(all(tree).find((node) => node.props.className === "wh-hook-body").props.hidden, false);
  const lists = all(tree).filter((node) => node.type === client.FieldList);
  assert.equal(lists.length, 1); assert.equal(lists[0].props.entry, reviewed);
  const fields = client.FieldList(lists[0].props);
  const details = all(fields).find((node) => node.type === "details");
  assert.ok(!details.props.open);
  assert.ok(text(details).includes("TOKEN=private-value"));
  const labels = all(fields).filter((node) => node.type === "dt").map(text);
  assert.equal(labels.length, 14); assert.equal(new Set(labels).size, 14);
  assert.ok(!all(tree).some((node) => ["input", "section"].includes(node.type)));
  disclosure.props.onClick(); assert.equal(cancelled, true);
});
test("file opening is an explicit separate action; synthetic profile sources have no file opener", () => {
  let opened;
  const props = { entry, card: view, t: (key) => key, onOpenSource: (value) => { opened = value; },
    onReview: () => assert.fail(), onAction: () => assert.fail() };
  const tree = client.HookRow(props);
  const button = all(tree).find((node) => node.props.title === "openSource");
  button.props.onClick(); assert.equal(opened, entry);
  const synthetic = client.HookRow({ ...props, entry: { ...entry, sourceLabel: "profile", source: "profile:web" } });
  assert.ok(!all(synthetic).some((node) => node.props.title === "openSource"));
});
test("native file opener passes only the source path and reports rejected opens", async () => {
  let options; let request;
  const ctx = { effect: (register) => register(), locale: { register: () => () => {}, bind: () => (key) => key },
    slots: { inject: (_, register) => register(), register: (value) => { options = value; } },
    remote: { session: { openWorkspacePath: async (value) => { request = value; return { ok: true }; } } } };
  client.apply(ctx);
  await options.inject().openSource(entry.source);
  assert.equal(request.path, entry.source); assert.deepEqual(Object.keys(request), ["path"]);
  ctx.remote.session = { openWorkspacePath: async () => ({ ok: false, error: { message: "cannot open" } }) };
  await assert.rejects(options.inject().openSource(entry.source), /cannot open/);
  ctx.remote.session = {};
  assert.equal(options.inject().openSource, undefined);
});
test("unapproved toggle opens review rather than granting trust or running commands", () => {
  let reviewed = false;
  const tree = client.HookRow({ entry, card: view, t: (key) => key, onReview: () => { reviewed = true; }, onAction: () => assert.fail("cannot authorize implicitly") });
  const toggle = all(tree).find((node) => node.type === "Switch");
  assert.equal(toggle.props.checked, false); toggle.props.onChange(); assert.equal(reviewed, true);
});
test("approved toggles only change host enable state; source-file disable stays read-only", () => {
  let action;
  const tree = client.HookRow({ entry: { ...entry, trusted: true }, card: view, t: (key) => key, onAction: (value) => { action = value; } });
  all(tree).find((node) => node.type === "Switch").props.onChange(); assert.equal(action, "disable");
  const off = client.HookRow({ entry: { ...entry, enabled: false }, card: view, t: (key) => key });
  assert.equal(all(off).find((node) => node.type === "Switch").props.disabled, true);
});
test("Approve is the single explicit grant action, with no checkbox or second review panel", () => {
  let approved;
  const props = { entry, card: view, t: (key) => key, review: { entry }, onApprove: (value) => { approved = value; } };
  const tree = client.HookRow(props);
  const approve = all(tree).find((node) => node.type === "Button" && text(node) === "approve");
  assert.equal(approve.props.disabled, false);
  approve.props.onClick(); assert.equal(approved, entry);
  assert.equal(all(tree).filter((node) => ["input", "textarea", "select"].includes(node.type)).length, 0);
  for (const disabled of [{ busy: true }, { entry: { ...entry, enabled: false } }, { card: { ...view, enabled: false } }, { entry: { ...entry, error: "bad" } }]) {
    const row = client.HookRow({ ...props, ...disabled });
    assert.equal(all(row).find((node) => node.type === "Button" && text(node) === "approve").props.disabled, true);
  }
  for (const retired of ["wh-review", "wh-confirm", "setConfirmed", "onConfirm"]) assert.ok(!source.includes(retired));
});
test("Approve reuses the exact review receipt and enables a previously disabled definition", async () => {
  const calls = [];
  browser.fetch = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ ok: true }) }; };
  try {
    await client.approveHook(entry, { entry: { ...entry, disabled: true }, nonce: "review-token" });
    assert.deepEqual(calls.map((call) => call.body.action), ["trust", "enable"]);
    assert.equal(calls[0].body.nonce, "review-token");
    assert.equal(calls[0].body.confirmation, "RUN AS DSH USER");
    assert.ok(calls.every((call) => call.body.key === entry.key && call.body.hash === entry.hash && call.body.cwd === entry.cwd));
  } finally { browser.fetch = () => assert.fail("Unexpected network request"); }
});
test("Approve from expanded details obtains a receipt without displaying a second confirmation", async () => {
  const calls = [];
  browser.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => url.endsWith("/review") ? { entry, nonce: "fresh-token" } : { ok: true } };
  };
  try {
    await client.approveHook(entry, { entry: { ...entry, key: "other" }, nonce: "wrong-token" });
    assert.deepEqual(calls.map((call) => call.url), [API + "/review", API + "/action"]);
    assert.equal(calls[1].body.nonce, "fresh-token");
  } finally { browser.fetch = () => assert.fail("Unexpected network request"); }
});
test("changed definitions and rejected receipts never grant or enable unseen commands", async () => {
  const calls = [];
  browser.fetch = async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ entry: { ...entry, hash: "changed" }, nonce: "new" }) };
  };
  try {
    await assert.rejects(client.approveHook(entry), /changed/);
    assert.deepEqual(calls, [API + "/review"]);
    calls.length = 0;
    browser.fetch = async (url) => { calls.push(url); return { ok: false, json: async () => ({ error: "Review expired" }) }; };
    await assert.rejects(client.approveHook(entry, { entry: { ...entry, disabled: true }, nonce: "expired" }), /expired/);
    assert.deepEqual(calls, [API + "/action"]);
  } finally { browser.fetch = () => assert.fail("Unexpected network request"); }
});
test("source opens a native modal with event groups and no definition editor", () => {
  const card = client.sourceCards([view])[0];
  const values = [[view], card.key, false, false, "", null];
  const old = React.useState;
  React.useState = () => [values.shift(), () => {}];
  try {
    const tree = client.ApprovalPage({ t: (key) => key });
    const modal = all(tree).find((node) => node.type === "Modal");
    assert.equal(modal.props.title, "project"); assert.equal(modal.props.description, "/project");
    assert.equal(modal.props.contentClassName, "wh-modal-content", "bound the native content flex chain, not the overlay");
    assert.ok(all(tree).some((node) => node.type === client.HookRow));
    assert.ok(!all(tree).some((node) => ["input", "textarea", "select"].includes(node.type)));
  } finally { React.useState = old; }
});

test("expanded modal is viewport bounded and only its body scrolls", () => {
  const rule = (selector) => {
    const start = source.indexOf(selector + "{");
    assert.ok(start >= 0, `missing ${selector}`);
    return source.slice(start, source.indexOf("}", start) + 1);
  };
  assert.match(rule(".wh-modal"), /max-height:calc\(100dvh/);
  assert.match(rule(".wh-modal-content"), /min-height:0/);
  assert.match(rule(".wh-modal-content"), /box-sizing:border-box/);
  assert.match(rule(".wh-modal-content"), /min-width:0/);
  assert.match(rule(".wh-modal-content"), /overflow:hidden/);
  assert.match(rule(".wh-modal-content>:not(:last-child)"), /flex-shrink:0/);
  const body = rule(".wh-modal-content>:last-child");
  assert.match(body, /min-height:0/);
  assert.match(body, /overflow-y:auto/);
  assert.match(body, /overscroll-behavior:contain/);
  assert.match(rule(".wh-modal-content>:last-child>*"), /flex-shrink:0/, "expanded event cards must overflow, not shrink and clip");
});
