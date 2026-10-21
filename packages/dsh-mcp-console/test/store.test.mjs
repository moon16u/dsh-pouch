import { tempDir, recoverTempDir } from "./helpers/temp.mjs";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Store, normalizeDoc, emptyDoc, globalStorePath, STORE_VERSION } from "../lib/store.js";

function tempStore(initial) {
  const dir = tempDir("mcp-console-store");
  const path = join(dir, "dsh-mcp.json");
  if (initial !== undefined) writeFileSync(path, JSON.stringify(initial), "utf8");
  return { store: new Store(path), dir, path };
}

test("global store path follows the official DSH home", () => {
  assert.equal(globalStorePath(), join(resolveDshHome(), "dsh-mcp.json"));
});

test("read returns empty doc for a missing file", () => {
  const { store, dir } = tempStore();
  const doc = store.read();
  assert.equal(doc.version, STORE_VERSION);
  assert.deepEqual(doc.servers, {});
  assert.equal(store.lastError, null);
  recoverTempDir(dir);
});

test("mutate persists atomically without backup files", () => {
  const { store, dir } = tempStore({ version: 1, servers: { a: { transport: "stdio", command: "x" } } });
  store.mutate((servers) => {
    servers.b = { transport: "stdio", command: "y" };
  });
  const doc = store.read();
  assert.deepEqual(Object.keys(doc.servers).sort(), ["a", "b"]);
  // deletions are explicit user intent: no backup files are kept
  const baks = readdirSync(dir).filter((name) => name.includes(".bak"));
  assert.equal(baks.length, 0);
  recoverTempDir(dir);
});

test("mutate returning false cancels the write", () => {
  const { store, dir } = tempStore({ version: 1, servers: {} });
  store.mutate(() => false);
  const doc = store.read();
  assert.deepEqual(doc.servers, {});
  recoverTempDir(dir);
});

test("corrupt file is moved aside and rebuilt empty with an error", () => {
  const { store, dir, path } = tempStore();
  writeFileSync(path, "{ not json", "utf8");
  const doc = store.read();
  assert.deepEqual(doc.servers, {});
  assert.ok(store.lastError?.includes("corrupt"), store.lastError ?? "");
  const asides = readdirSync(dir).filter((name) => name.includes(".corrupt."));
  assert.ok(asides.length >= 1, "expected the corrupt file moved to .corrupt.<ts>");
  recoverTempDir(dir);
});

test("normalizeDoc tolerates junk shapes", () => {
  assert.deepEqual(normalizeDoc(null).doc, emptyDoc());
  assert.deepEqual(normalizeDoc([1, 2]).doc, emptyDoc());
  const { doc, error } = normalizeDoc({ version: 1, servers: "nope" });
  assert.deepEqual(doc.servers, {});
  assert.ok(error);
});
