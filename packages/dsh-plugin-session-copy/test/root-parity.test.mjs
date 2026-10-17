import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const pouchRoot = join(packageRoot, "..", "..");

/**
 * Cross-package parity: the root pouch bundle inlines this plugin's browser
 * section, and the two copies must stay identical. The root copy aliases the
 * primitives module as `_uiPrimitives`, which is the only allowed difference.
 * The root `apply` body continues into sibling plugins, so its copy of this
 * plugin's registration section omits the closing brace of `apply`.
 */

/** Read one marked section, normalizing the primitives alias and trailing braces. */
async function readSection(path, startMarker, endMarker, { fromRoot, stripTrailingBrace = false }) {
  const source = await readFile(path, "utf8");
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.includes(startMarker));
  const end = lines.findIndex((line, index) => index > start && line.includes(endMarker));
  assert.ok(start >= 0, `${path} must contain ${startMarker}`);
  assert.ok(end > start, `${path} must contain ${endMarker} after the start`);
  const section = lines.slice(start + 1, end);
  while (section.length > 0 && section[section.length - 1].trim() === "") section.pop();
  if (stripTrailingBrace && section[section.length - 1] === "    }") section.pop();
  const text = section.join("\n");
  return fromRoot ? text.split("_uiPrimitives.").join("primitives.") : text;
}

const BODY = ["==== session-copy client body", "==== end session-copy client body"];
const APPLY = ["==== session-copy apply", "==== end session-copy apply"];

test("root bundle and package bundle expose the same session-copy body", async () => {
  const fromPackage = await readSection(join(packageRoot, "lib/client.js"), BODY[0], BODY[1], { fromRoot: false });
  const fromRoot = await readSection(join(pouchRoot, "lib/client.js"), BODY[0], BODY[1], { fromRoot: true });
  assert.equal(fromRoot, fromPackage, "the inlined body must match this package byte for byte");
});

test("root bundle and package bundle expose the same session-copy registration", async () => {
  const fromPackage = await readSection(join(packageRoot, "lib/client.js"), APPLY[0], APPLY[1], { fromRoot: false });
  const fromRoot = await readSection(join(pouchRoot, "lib/client.js"), APPLY[0], APPLY[1], { fromRoot: true });
  // The root apply() body continues into sibling plugins, so its copy of this
  // section ends without the closing brace of apply().
  assert.equal(fromRoot.replace(/\n\s*$/, ""), fromPackage.replace(/\n\s*\}\s*$/, ""), "the inlined registration must match this package");
});

test("root bundle still carries the neighbouring plugin sections", async () => {
  const source = await readFile(join(pouchRoot, "lib/client.js"), "utf8");
  assert.doesNotMatch(source, /dsh-plugin-llm-headers/, "llm-headers has been retired from the bundle");
  assert.match(source, /mcpConsoleApply/);
  assert.match(source, /Smoothly restart DSH process in 3 seconds/);
  assert.match(source, /--dsw-alias-label-primary/);
  assert.doesNotMatch(source, /复制会话 ID/, "the legacy bare-id label is gone from the root bundle");

  const baseline = await readFile(join(pouchRoot, "lib/client.js"), "utf8");
  for (const neighbour of ["McpSection", "mcpConsoleApply"]) {
    assert.ok(baseline.includes(neighbour), `${neighbour} must survive the sync`);
  }
});

test("root bundle registers its ModuleLoader payload with the new menu section", async () => {
  const source = await readFile(join(pouchRoot, "lib/client.js"), "utf8");
  const captured = [];
  const previousWindow = globalThis.window;
  globalThis.window = {
    __ModuleLoader__: { load: (entry) => { captured.push(entry); } },
    __DSH_BOOT__: undefined,
  };
  try {
    await import("data:text/javascript," + encodeURIComponent(source));
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
  const main = captured.find((entry) => entry.id === "@moon16u/dsh-pouch");
  assert.ok(main, "the root bundle must register under its own id");
  assert.equal(typeof main.factory, "function", "the root payload keeps a factory");
  assert.match(source, /conversation\.session\.header\.utilities/);
});
