import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, normalizeDoc, emptyDoc, globalStorePath, STORE_VERSION } from "../lib/store.js";

function tempStore(initial) {
  const dir = mkdtempSync(join(tmpdir(), "mcp-console-store-"));
  const path = join(dir, "dsh-mcp.json");
  if (initial !== undefined) writeFileSync(path, JSON.stringify(initial), "utf8");
  return { store: new Store(path), dir, path };
}

test("global store path is ~/.dsh/dsh-mcp.json", () => {
  assert.match(globalStorePath(), /\.dsh\/dsh-mcp\.json$/);
});

test("read returns empty doc for a missing file", () => {
  const { store, dir } = tempStore();
  const doc = store.read();
  assert.equal(doc.version, STORE_VERSION);
  assert.deepEqual(doc.servers, {});
  assert.equal(store.lastError, null);
  rmSync(dir, { recursive: true, force: true });
});

test("mutate persists atomically with a .bak backup", () => {
  const { store, dir } = tempStore({ version: 1, servers: { a: { transport: "stdio", command: "x" } } });
  store.mutate((servers) => {
    servers.b = { transport: "stdio", command: "y" };
  });
  const doc = store.read();
  assert.deepEqual(Object.keys(doc.servers).sort(), ["a", "b"]);
  // deletions are explicit user intent: no backup files are kept
  const baks = readdirSync(dir).filter((name) => name.includes(".bak"));
  assert.equal(baks.length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("mutate returning false cancels the write", () => {
  const { store, dir } = tempStore({ version: 1, servers: {} });
  store.mutate(() => false);
  const doc = store.read();
  assert.deepEqual(doc.servers, {});
  rmSync(dir, { recursive: true, force: true });
});

test("corrupt file is moved aside and rebuilt empty with an error", () => {
  const { store, dir, path } = tempStore();
  writeFileSync(path, "{ not json", "utf8");
  const doc = store.read();
  assert.deepEqual(doc.servers, {});
  assert.ok(store.lastError?.includes("corrupt"), store.lastError ?? "");
  const asides = readdirSync(dir).filter((name) => name.includes(".corrupt."));
  assert.ok(asides.length >= 1, "expected the corrupt file moved to .corrupt.<ts>");
  rmSync(dir, { recursive: true, force: true });
});

test("normalizeDoc tolerates junk shapes", () => {
  assert.deepEqual(normalizeDoc(null).doc, emptyDoc());
  assert.deepEqual(normalizeDoc([1, 2]).doc, emptyDoc());
  const { doc, error } = normalizeDoc({ version: 1, servers: "nope" });
  assert.deepEqual(doc.servers, {});
  assert.ok(error);
});

test("writeUi keeps servers and persists ui", () => {
  const { store, dir } = tempStore({ version: 1, servers: { a: { transport: "stdio", command: "x" } } });
  store.writeUi({ position: "bottom-right", offsetX: 12, offsetY: 3 });
  const doc = store.read();
  assert.deepEqual(doc.ui, { position: "bottom-right", offsetX: 12, offsetY: 3 });
  assert.deepEqual(Object.keys(doc.servers), ["a"]);
  rmSync(dir, { recursive: true, force: true });
});
