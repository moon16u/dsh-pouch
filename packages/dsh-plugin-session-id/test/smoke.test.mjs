import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

test("host entry exports the directory route surface", async () => {
  const mod = await import("../lib/index.js");
  assert.equal(typeof mod.apply, "function");
  assert.equal(mod.SESSION_ID_DIRECTORY_PATH, "/api/dsh-session-id/directory");
});

test("client bundle is a ModuleLoader payload for dsh-session-id", async () => {
  const source = await readFile(join(root, "lib/client.js"), "utf8");
  assert.match(source, /window\.__ModuleLoader__\.load\(\{/);
  assert.match(source, /id:\s*"@moon16u\/dsh-plugin-session-id"/);
  assert.match(source, /"conversation\.session\.header\.utilities"/);
  assert.match(source, /"dsh-session-id"/);
});

test("client bundle copies the menu values rather than the raw session id", async () => {
  const source = await readFile(join(root, "lib/client.js"), "utf8");
  assert.match(source, /"directory":\s*"会话目录"/);
  assert.match(source, /"title":\s*"会话标题"/);
  assert.match(source, /"cwd":\s*"工作目录"/);
  assert.match(source, /useSessions/);
  assert.match(source, /displayTitle/);
  assert.match(source, /primitives\.writeClipboard/);
  assert.doesNotMatch(source, /navigator\.clipboard|document\.execCommand/);
  // The bare-id copy affordance is gone: the header now copies the three
  // resolved values, and the only remaining id usage is the route query.
  assert.doesNotMatch(source, /复制会话 ID/);
  assert.doesNotMatch(source, /exports\.copy = /);
});

test("client bundle reuses the shared Menu with accessible menu semantics", async () => {
  const source = await readFile(join(root, "lib/client.js"), "utf8");
  assert.match(source, /primitives\.Menu/);
  assert.match(source, /aria-haspopup":\s*"menu"/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /aria-live":\s*"polite"/);
  assert.match(source, /api\/dsh-session-id\/directory/);
});

test("client bundle keeps the Session log button styling", async () => {
  const source = await readFile(join(root, "lib/client.js"), "utf8");
  assert.match(source, /height:32px/);
  assert.match(source, /border-radius:18px/);
  assert.match(source, /dsh-session-id-copy/);
  assert.match(source, /--dsw-alias-label-primary/);
});

test("package.json points to runtime bundles", async () => {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "@moon16u/dsh-plugin-session-id");
  assert.equal(pkg.exports["."].default, "./lib/index.js");
  assert.equal(pkg.exports["./client"].default, "./lib/client.js");
});
