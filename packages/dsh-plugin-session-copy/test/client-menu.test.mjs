import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/**
 * Behavior tests for the header copy menu. The bundle is materialized exactly
 * as the browser module loader does, but React is replaced by a tiny hook
 * runtime so the real component can be rendered, clicked, and re-rendered
 * without a DOM. These tests therefore exercise component logic (menu props,
 * disabled gating, clipboard values, race guards, teardown) instead of
 * matching source text.
 */

/** Minimal React replacement: element creation plus index-addressed hooks. */
function createRuntime() {
  let hooks = [];
  let cursor = 0;
  let pendingEffects = [];
  let dirty = false;

  const React = {
    Fragment: Symbol.for("react.fragment"),
    createElement(type, props, ...children) {
      const merged = Object.assign({}, props || {});
      if (children.length === 1) merged.children = children[0];
      else if (children.length > 1) merged.children = children;
      // Function components are expanded eagerly: children are created before
      // their parent, so the tree is already fully resolved when visitors run.
      if (typeof type === "function") return type(merged);
      return { type, props: merged };
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial;
      const set = (value) => {
        const next = typeof value === "function" ? value(hooks[index]) : value;
        if (Object.is(next, hooks[index])) return;
        hooks[index] = next;
        dirty = true;
      };
      return [hooks[index], set];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const slot = hooks[index];
      const previous = slot === undefined ? undefined : slot.deps;
      const changed = slot === undefined || !deps || !previous ||
        deps.length !== previous.length || deps.some((value, i) => !Object.is(value, previous[i]));
      if (!changed) return;
      if (slot && typeof slot.cleanup === "function") slot.cleanup();
      hooks[index] = { deps: deps ? deps.slice() : null, fn, cleanup: undefined };
      pendingEffects.push(index);
    },
  };

  function renderOnce(Component, props) {
    cursor = 0;
    pendingEffects = [];
    const element = Component(props);
    const queue = pendingEffects.slice();
    pendingEffects = [];
    for (const index of queue) {
      const slot = hooks[index];
      if (slot === undefined) continue;
      const cleanup = slot.fn();
      slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    }
    return element;
  }

  return {
    React,
    /** Mount one component instance; effects run and state settles eagerly. */
    mount(Component, initialProps) {
      const state = { props: initialProps, element: null, unmounted: false };
      function flush() {
        if (state.unmounted) return state.element;
        for (let guard = 0; guard < 60; guard += 1) {
          dirty = false;
          state.element = renderOnce(Component, state.props);
          if (!dirty) return state.element;
        }
        throw new Error("component did not settle");
      }
      state.flush = flush;
      state.setProps = (next) => {
        state.props = Object.assign({}, state.props, next);
        dirty = true;
        return flush();
      };
      state.unmount = () => {
        state.unmounted = true;
        for (let i = hooks.length - 1; i >= 0; i -= 1) {
          const slot = hooks[i];
          if (slot && typeof slot.cleanup === "function") slot.cleanup();
        }
        hooks = [];
      };
      flush();
      return state;
    },
  };
}

/** Depth-first walk over a rendered element tree. */
function walk(element, visit) {
  if (element === null || element === undefined) return;
  if (Array.isArray(element)) {
    for (const child of element) walk(child, visit);
    return;
  }
  if (typeof element !== "object") return;
  visit(element);
  if (element.props) walk(element.props.children, visit);
}

/** Find the single element satisfying a predicate. */
function findOne(element, predicate) {
  const hits = [];
  walk(element, (candidate) => { if (predicate(candidate)) hits.push(candidate); });
  assert.equal(hits.length, 1, `expected exactly one matching element, found ${hits.length}`);
  return hits[0];
}

/** Materialize the bundle once, capturing its ModuleLoader registration. */
let registrationPromise = null;
function loadRegistration() {
  if (registrationPromise !== null) return registrationPromise;
  registrationPromise = (async () => {
    const source = await readFile(join(root, "lib/client.js"), "utf8");
    let registration;
    globalThis.window = { __ModuleLoader__: { load: (candidate) => { registration = candidate; } } };
    await import("data:text/javascript," + encodeURIComponent(source));
    assert.ok(registration, "bundle must register through __ModuleLoader__.load");
    return registration;
  })();
  return registrationPromise;
}

const DEFAULT_DIRECTORY = "/sessions/project/session-1/";
const SUMMARY = { displayTitle: "重构会话目录复制菜单", cwd: "/home/moon1/Agent YueJian" };

/**
 * Build one component instance plus every fake it needs.
 * @returns harness exposing flush/settle, captured props, and recorded calls.
 */
async function createHarness(options = {}) {
  const registration = await loadRegistration();
  const runtime = createRuntime();
  const { React } = runtime;
  const menuHolder = { props: null };
  const clipboardCalls = [];
  const fetchCalls = [];

  function Menu(props) {
    menuHolder.props = props;
    return React.createElement("div", { "data-menu-open": props.open ? "true" : "false" }, props.anchor);
  }

  const primitives = {
    Menu,
    async writeClipboard(text) {
      clipboardCalls.push(text);
      if (options.writeClipboard) return options.writeClipboard(text);
      if (options.clipboardRejects) throw new Error("clipboard denied");
      return options.clipboardResult !== false;
    },
    IconCopyOutlineRegular: (props) => React.createElement("svg", { "data-icon": "copy" }),
    IconCheckOutlineRegular: (props) => React.createElement("svg", { "data-icon": "check" }),
  };

  const requireShim = (id) => {
    if (id === "react") return React;
    if (id === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
    throw new Error(`the bundle required an unexpected module: ${id}`);
  };
  const bundle = registration.factory(requireShim);

  const registered = {};
  let component = null;
  let slotName = null;
  bundle.apply({
    effect(fn) { fn(); return () => {}; },
    locale: { register(ns, dicts) { registered.ns = ns; registered.dicts = dicts; return () => {}; } },
    slots: {
      inject(name, callback) { slotName = name; component = callback(); },
      register(definition, factory) { return factory; },
    },
  });
  assert.equal(slotName, "conversation.session.header.utilities");
  assert.ok(component, "apply must register the header action");

  const t = (key) => {
    const table = registered.dicts.zh;
    return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;
  };

  const fetchImpl = options.fetch || (async (url, init) => {
    fetchCalls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() { return { ok: true, directory: DEFAULT_DIRECTORY }; },
    };
  });

  const previous = { fetch: globalThis.fetch };
  globalThis.fetch = fetchImpl;

  const sessions = { byId: options.sessions || {} };
  const useSessions = (selector) => selector(sessions);

  const instance = runtime.mount(component, {
    sessionId: options.sessionId === undefined ? "session-1" : options.sessionId,
    t,
    useSessions,
  });

  return {
    ...instance,
    get element() { return instance.element; },
    bundle,
    menu: menuHolder,
    registered,
    clipboardCalls,
    fetchCalls,
    sessions,
    /** Drain promise continuations and settle every resulting re-render. */
    async settle() {
      for (let round = 0; round < 8; round += 1) {
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
        if (instance.unmounted) return;
        instance.flush();
      }
    },
    restore() {
      if (!instance.unmounted) instance.unmount();
      globalThis.fetch = previous.fetch;
    },
  };
}

test("dictionaries expose the copy menu labels in both languages", async () => {
  const harness = await createHarness();
  try {
    assert.equal(harness.registered.ns, "session-copy");
    assert.deepEqual(
      ["label", "directory", "title", "cwd", "copied", "copyFailed"].map((k) => harness.registered.dicts.zh[k]),
      ["复制", "会话目录", "会话标题", "工作目录", "已复制", "复制失败"],
    );
    assert.deepEqual(
      ["label", "directory", "title", "cwd", "copied", "copyFailed"].map((k) => harness.registered.dicts.en[k]),
      ["Copy", "Session directory", "Session title", "Working directory", "Copied", "Copy failed"],
    );
  } finally {
    harness.restore();
  }
});

test("copyValuesFor resolves the exact clipboard text for each menu item", async () => {
  const harness = await createHarness();
  try {
    assert.deepEqual(
      harness.bundle.copyValuesFor(SUMMARY, { status: "ready", directory: DEFAULT_DIRECTORY, reason: "" }),
      { directory: DEFAULT_DIRECTORY, title: "重构会话目录复制菜单", cwd: "/home/moon1/Agent YueJian" },
    );
  } finally {
    harness.restore();
  }
});

test("copyValuesFor omits absent values so those rows stay disabled", async () => {
  const harness = await createHarness();
  try {
    assert.deepEqual(harness.bundle.copyValuesFor(undefined, { status: "idle", directory: "", reason: "" }), {});
    assert.deepEqual(harness.bundle.copyValuesFor({ displayTitle: "", cwd: "" }, { status: "unavailable", directory: "", reason: "directory_unavailable" }), {});
    assert.deepEqual(harness.bundle.copyValuesFor({}, { status: "ready", directory: "" }), {});
  } finally {
    harness.restore();
  }
});

test("menu exposes exactly three items in title/directory/cwd order", async () => {
  const harness = await createHarness();
  try {
    assert.deepEqual(harness.menu.props.items.map((item) => item.id), ["title", "directory", "cwd"]);
    assert.deepEqual(harness.menu.props.items.map((item) => item.disabled), [true, true, true]);
    assert.equal(harness.menu.props.align, "end");
    assert.equal(harness.menu.props.portal, true);
    assert.equal(harness.menu.props.autoFocus, true);
    assert.equal(harness.menu.props.open, false);
  } finally {
    harness.restore();
  }
});

test("trigger is a menu button labelled 复制 with correct aria state", async () => {
  const harness = await createHarness({ sessions: { "session-1": SUMMARY } });
  try {
    const trigger = harness.menu.props.anchor;
    assert.equal(trigger.type, "button");
    assert.equal(trigger.props["aria-haspopup"], "menu");
    assert.equal(trigger.props["aria-expanded"], "false");
    assert.equal(trigger.props["data-session-copy-copy"], "");
    assert.equal(trigger.props["aria-label"], "复制");
    findOne(trigger, (el) => el.props && el.props.children === "复制");
  } finally {
    harness.restore();
  }
});

test("opening the menu lazily loads the session directory once", async () => {
  const harness = await createHarness({ sessions: { "session-1": SUMMARY } });
  try {
    harness.menu.props.anchor.props.onClick();
    harness.flush();
    await harness.settle();
    assert.equal(harness.fetchCalls.length, 1, "one request per open");
    assert.equal(harness.fetchCalls[0].init.method, "GET");
    assert.equal(harness.fetchCalls[0].init.credentials, "same-origin");
    assert.equal(harness.fetchCalls[0].url, "api/dsh-session-copy/directory?sessionId=session-1");
    assert.equal(harness.menu.props.open, true);
    assert.deepEqual(harness.menu.props.items.map((item) => item.disabled), [false, false, false]);
    assert.equal(harness.menu.props.anchor.props["aria-expanded"], "true");
    harness.menu.props.anchor.props.onClick();
    harness.flush();
    await harness.settle();
    assert.equal(harness.fetchCalls.length, 1, "an already-resolved directory is not re-fetched");
  } finally {
    harness.restore();
  }
});

test("selecting the directory row copies the plain directory path", async () => {
  const harness = await createHarness({ sessions: { "session-1": SUMMARY } });
  try {
    harness.menu.props.anchor.props.onClick();
    harness.flush();
    await harness.settle();
    await harness.menu.props.onSelect("directory");
    await harness.settle();
    assert.deepEqual(harness.clipboardCalls, [DEFAULT_DIRECTORY], "a plain path, not a file:// URI");
    assert.equal(harness.menu.props.open, false, "selecting closes the menu");
  } finally {
    harness.restore();
  }
});

test("selecting the title row copies the displayed title verbatim", async () => {
  const harness = await createHarness({ sessions: { "session-1": SUMMARY } });
  try {
    await harness.menu.props.onSelect("title");
    await harness.settle();
    assert.deepEqual(harness.clipboardCalls, ["重构会话目录复制菜单"]);
  } finally {
    harness.restore();
  }
});

test("selecting the cwd row copies the raw working directory", async () => {
  const harness = await createHarness({ sessions: { "session-1": SUMMARY } });
  try {
    await harness.menu.props.onSelect("cwd");
    await harness.settle();
    assert.deepEqual(harness.clipboardCalls, ["/home/moon1/Agent YueJian"]);
  } finally {
    harness.restore();
  }
});

test("disabled rows copy nothing", async () => {
  const harness = await createHarness();
  try {
    await harness.menu.props.onSelect("title");
    await harness.menu.props.onSelect("cwd");
    await harness.menu.props.onSelect("directory");
    await harness.settle();
    assert.deepEqual(harness.clipboardCalls, []);
  } finally {
    harness.restore();
  }
});

test("successful copy shows 已复制 in a live region, then reverts after 2s", async () => {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = (callback, ms) => { timers.push({ callback, ms }); return timers.length; };
  globalThis.clearTimeout = () => {};
  const harness = await createHarness({ sessions: { "session-1": SUMMARY } });
  try {
    await harness.menu.props.onSelect("title");
    await harness.settle();
    assert.equal(harness.menu.props.anchor.props["aria-label"], "已复制");
    const status = findOne(harness.element, (el) => el.props && el.props.role === "status");
    assert.equal(status.props["aria-live"], "polite");
    assert.equal(status.props.children, "已复制");
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 2000);
    timers[0].callback();
    harness.flush();
    assert.equal(harness.menu.props.anchor.props["aria-label"], "复制");
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    harness.restore();
  }
});

test("failed copy surfaces 复制失败 rather than only logging", async () => {
  const harness = await createHarness({ sessions: { "session-1": SUMMARY }, clipboardRejects: true });
  try {
    const originalError = console.error;
    console.error = () => {};
    try {
      await harness.menu.props.onSelect("title");
      await harness.settle();
    } finally {
      console.error = originalError;
    }
    assert.equal(harness.menu.props.anchor.props["aria-label"], "复制失败");
    const status = findOne(harness.element, (el) => el.props && el.props.role === "status");
    assert.equal(status.props.children, "复制失败");
  } finally {
    harness.restore();
  }
});

test("copyText delegates to the shared clipboard helper", async () => {
  const harness = await createHarness();
  try {
    assert.equal(await harness.bundle.copyText("verbatim clipboard text"), undefined);
    assert.deepEqual(harness.clipboardCalls, ["verbatim clipboard text"]);
  } finally {
    harness.restore();
  }
});

test("a false result from the clipboard helper reports failure", async () => {
  const harness = await createHarness({ sessions: { "session-1": SUMMARY }, clipboardResult: false });
  try {
    const originalError = console.error;
    console.error = () => {};
    try {
      await harness.menu.props.onSelect("cwd");
      await harness.settle();
    } finally {
      console.error = originalError;
    }
    assert.equal(harness.menu.props.anchor.props["aria-label"], "复制失败");
  } finally {
    harness.restore();
  }
});

test("a directory failure disables that row and leaves the others usable", async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, async json() { return { ok: false, error: "directory_unavailable" }; } });
  const harness = await createHarness({ sessions: { "session-1": SUMMARY }, fetch: fetchImpl });
  try {
    harness.menu.props.anchor.props.onClick();
    harness.flush();
    await harness.settle();
    const byId = Object.fromEntries(harness.menu.props.items.map((item) => [item.id, item]));
    assert.equal(byId.directory.disabled, true, "no directory value means no copy");
    assert.equal(byId.title.disabled, false);
    assert.equal(byId.cwd.disabled, false);
  } finally {
    harness.restore();
  }
});

test("reopening after a failure retries the directory lookup", async () => {
  let attempt = 0;
  const fetchImpl = async () => {
    attempt += 1;
    if (attempt === 1) return { ok: false, status: 500, async json() { return { ok: false, error: "resolve_failed" }; } };
    return { ok: true, status: 200, async json() { return { ok: true, directory: DEFAULT_DIRECTORY }; } };
  };
  const harness = await createHarness({ sessions: { "session-1": SUMMARY }, fetch: fetchImpl });
  try {
    const directoryRow = () => harness.menu.props.items.find((item) => item.id === "directory");
    harness.menu.props.anchor.props.onClick();
    harness.flush();
    await harness.settle();
    assert.equal(directoryRow().disabled, true);
    harness.menu.props.onClose();
    harness.flush();
    harness.menu.props.anchor.props.onClick();
    harness.flush();
    await harness.settle();
    assert.equal(attempt, 2, "a later open retries the lookup");
    assert.equal(directoryRow().disabled, false);
  } finally {
    harness.restore();
  }
});

test("a stale directory response never paints the newly selected session", async () => {
  let releaseFirst;
  const fetchImpl = (url) => {
    if (url.includes("session-1")) {
      return new Promise((resolve) => {
        releaseFirst = () => resolve({ ok: true, status: 200, async json() { return { ok: true, directory: "/sessions/one/" }; } });
      });
    }
    return new Promise(() => {});
  };
  const harness = await createHarness({
    sessions: { "session-1": SUMMARY, "session-2": { displayTitle: "另一个会话", cwd: "/home/moon1/other" } },
    fetch: fetchImpl,
  });
  try {
    harness.menu.props.anchor.props.onClick();
    harness.flush();
    await harness.settle();
    harness.setProps({ sessionId: "session-2" });
    await harness.settle();
    releaseFirst();
    await harness.settle();
    const directoryRow = harness.menu.props.items.find((item) => item.id === "directory");
    assert.equal(directoryRow.disabled, true, "the stale session-1 path must not become copyable");
    await harness.menu.props.onSelect("directory");
    await harness.settle();
    assert.deepEqual(harness.clipboardCalls, [], "selecting the actual row must not copy a stale path");
    assert.equal(harness.menu.props.anchor.props["aria-label"], "复制", "feedback resets on session switch");
  } finally {
    harness.restore();
  }
});

test("a late clipboard result from a previous session paints nothing", async () => {
  let releaseCopy;
  const writeClipboard = () => new Promise((resolve) => { releaseCopy = () => resolve(true); });
  const harness = await createHarness({
    sessions: { "session-1": SUMMARY, "session-2": { displayTitle: "另一个会话", cwd: "/home/moon1/other" } },
    writeClipboard,
  });
  try {
    const pending = harness.menu.props.onSelect("title");
    harness.setProps({ sessionId: "session-2" });
    await harness.settle();
    releaseCopy();
    await pending;
    await harness.settle();
    assert.equal(harness.menu.props.anchor.props["aria-label"], "复制");
  } finally {
    harness.restore();
  }
});

test("unmount aborts an in-flight directory request", async () => {
  let capturedSignal = null;
  const fetchImpl = (url, init) => {
    capturedSignal = init.signal;
    return new Promise(() => {});
  };
  const harness = await createHarness({ sessions: { "session-1": SUMMARY }, fetch: fetchImpl });
  try {
    harness.menu.props.anchor.props.onClick();
    harness.flush();
    await harness.settle();
    assert.ok(capturedSignal, "the component passes an abort signal");
    assert.equal(capturedSignal.aborted, false);
    harness.unmount();
    assert.equal(capturedSignal.aborted, true, "unmount aborts the in-flight request");
  } finally {
    harness.restore();
  }
});

for (const outcome of ["resolve", "reject"]) {
  test(`requestDirectory ignores a body ${outcome} after cancellation`, async () => {
    const harness = await createHarness();
    const controller = new AbortController();
    let releaseBody;
    const body = new Promise((resolve, reject) => {
      releaseBody = () => outcome === "resolve"
        ? resolve({ ok: true, directory: "/sessions/stale/" })
        : reject(new DOMException("Cancelled", "AbortError"));
    });
    try {
      const pending = harness.bundle.requestDirectory("session-1", {
        signal: controller.signal,
        fetch: async () => ({ ok: true, status: 200, json: () => body }),
      });
      await harness.settle();
      controller.abort();
      releaseBody();
      assert.equal(await pending, null);
    } finally {
      harness.restore();
    }
  });
}

for (const abortAvailable of [true, false]) {
  for (const lateFailure of [false, true]) {
    test(`reopening the same session ignores a late ${lateFailure ? "failure" : "success"} with AbortController=${abortAvailable}`, async () => {
      const originalController = globalThis.AbortController;
      if (!abortAvailable) globalThis.AbortController = undefined;
      const requests = [];
      const harness = await createHarness({
        sessions: { "session-1": SUMMARY },
        fetch: (url, init) => new Promise((resolve) => { requests.push({ resolve, signal: init.signal }); }),
      });
      const directoryRow = () => harness.menu.props.items.find((item) => item.id === "directory");
      try {
        harness.menu.props.anchor.props.onClick();
        harness.flush();
        harness.menu.props.onClose();
        harness.flush();
        harness.menu.props.anchor.props.onClick();
        harness.flush();
        assert.equal(requests.length, 2);
        if (abortAvailable) assert.equal(requests[0].signal.aborted, true);
        // The fake transport deliberately ignores cancellation.
        requests[0].resolve(lateFailure ? {
          get ok() { throw new Error("late response failure"); },
          status: 500, async json() { return null; },
        } : {
          ok: true, status: 200, async json() { return { ok: true, directory: "/sessions/stale/" }; },
        });
        await harness.settle();
        assert.equal(directoryRow().disabled, true);
        findOne(directoryRow().label, (el) => el.props && el.props.children === "正在获取会话目录");
        requests[1].resolve({ ok: true, status: 200, async json() { return { ok: true, directory: "/sessions/fresh/" }; } });
        await harness.settle();
        assert.equal(directoryRow().disabled, false);
        await harness.menu.props.onSelect("directory");
        await harness.settle();
        assert.deepEqual(harness.clipboardCalls, ["/sessions/fresh/"]);
      } finally {
        harness.restore();
        globalThis.AbortController = originalController;
      }
    });
  }
}

test("unavailable directory labels include the log-format limitation in both languages", async () => {
  const harness = await createHarness();
  try {
    for (const [language, expected] of [
      ["zh", "尚未落盘，或日志格式不受当前定位接口支持"],
      ["en", "Not on disk yet, or the log format cannot be located by this API"],
    ]) {
      const t = (key) => harness.registered.dicts[language][key];
      const entries = harness.bundle.buildMenuEntries(t, SUMMARY, { status: "unavailable", reason: "directory_unavailable", directory: "" });
      const directory = entries.find((item) => item.id === "directory");
      assert.equal(directory.disabled, true);
      findOne(directory.label, (el) => el.props && el.props.children === expected);
    }
  } finally {
    harness.restore();
  }
});

test("copyText rejects false and propagates thrown errors from the shared helper", async () => {
  const denied = await createHarness({ clipboardResult: false });
  try {
    await assert.rejects(denied.bundle.copyText("denied"), /clipboard write failed/);
    assert.deepEqual(denied.clipboardCalls, ["denied"]);
  } finally {
    denied.restore();
  }
  const error = new Error("clipboard unavailable");
  const throwing = await createHarness({ writeClipboard: async () => { throw error; } });
  try {
    await assert.rejects(throwing.bundle.copyText("throwing"), (actual) => actual === error);
    assert.deepEqual(throwing.clipboardCalls, ["throwing"]);
  } finally {
    throwing.restore();
  }
});

test("directory requests encode opaque ids without changing their decoded value", async () => {
  const harness = await createHarness();
  try {
    const id = "会话 1&x=y#z%41/a\\b\0";
    const url = harness.bundle.directoryRequestUrl(id);
    assert.equal(new URL(url, "http://localhost/").searchParams.get("sessionId"), id);
  } finally {
    harness.restore();
  }
});

test("bundle exports the documented surface", async () => {
  const harness = await createHarness();
  try {
    for (const name of ["SessionCopyAction", "SessionIdAction", "apply", "buildMenuEntries", "copyValuesFor", "copyText", "requestDirectory", "directoryRequestUrl"]) {
      assert.equal(typeof harness.bundle[name], "function", `${name} must be exported`);
    }
    assert.deepEqual(harness.bundle.inject, ["slots", "locale"]);
    assert.equal(harness.bundle.DIRECTORY_ROUTE, "api/dsh-session-copy/directory");
  } finally {
    harness.restore();
  }
});
