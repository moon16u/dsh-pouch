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

async function loadBundle(sourcePath, react) {
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
        IconChevronRightOutline14: () => react.createElement("svg", { "data-icon": "chevron" }),
      };
    }
    throw new Error(`the bundle required an unexpected module: ${id}`);
  };
  return registration.factory(requireShim);
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
