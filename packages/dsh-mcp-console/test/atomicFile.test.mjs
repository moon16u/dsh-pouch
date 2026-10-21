import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { renameAtomicSync, writeFileAtomicSync } from "../lib/atomicFile.js";
import { tempDir } from "./helpers/temp.mjs";

for (const code of ["EACCES", "EBUSY", "EPERM"]) {
  test(`Windows atomic replacement retries ${code} without deleting the target`, () => {
    const waits = [];
    let calls = 0;
    renameAtomicSync("source", "target", {
      platform: "win32",
      rename(from, to) {
        assert.equal(from, "source");
        assert.equal(to, "target");
        if (++calls < 4) throw Object.assign(new Error("sharing conflict"), { code });
      },
      sleep(ms) { waits.push(ms); },
    });
    assert.equal(calls, 4);
    assert.deepEqual(waits, [20, 40, 80]);
  });
}

test("Windows retry budget matches official DSH and rethrows the final error", () => {
  const error = Object.assign(new Error("locked"), { code: "EPERM" });
  const waits = [];
  let calls = 0;
  assert.throws(() => renameAtomicSync("a", "b", {
    platform: "win32",
    rename() { calls++; throw error; },
    sleep(ms) { waits.push(ms); },
  }), failure => failure === error);
  assert.equal(calls, 9);
  assert.deepEqual(waits, [20, 40, 80, 160, 200, 200, 200, 200]);
});

for (const [platform, code] of [["linux", "EPERM"], ["darwin", "EBUSY"], ["win32", "ENOENT"], ["win32", "EXDEV"]]) {
  test(`${platform}/${code} is not retried`, () => {
    const error = Object.assign(new Error(code), { code });
    let calls = 0;
    assert.throws(() => renameAtomicSync("a", "b", {
      platform,
      rename() { calls++; throw error; },
      sleep() { assert.fail("must fail immediately"); },
    }), failure => failure === error);
    assert.equal(calls, 1);
  });
}

test("atomic writer replaces complete UTF-8 content and uses private native permissions", () => {
  const dir = tempDir("atomic");
  const target = join(dir, "nested space", "config.json");
  writeFileAtomicSync(target, '{"version":1}\n');
  writeFileAtomicSync(target, '{"version":2,"name":"\\u6708\\u89c1"}\n');
  assert.equal(JSON.parse(fs.readFileSync(target, "utf8")).version, 2);
  assert.deepEqual(fs.readdirSync(join(dir, "nested space")), ["config.json"]);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(target).mode & 0o777, 0o600);
    assert.equal(fs.statSync(join(dir, "nested space")).mode & 0o777, 0o700);
  }
});

test("failed replacement leaves the old target intact and removes only its own temp", () => {
  const dir = tempDir("atomic-failure");
  const target = join(dir, "config.json");
  writeFileAtomicSync(target, "original");
  const error = Object.assign(new Error("disk failure"), { code: "EIO" });
  const rename = mock.method(fs, "renameSync", () => { throw error; });
  syncBuiltinESMExports();
  try {
    assert.throws(() => writeFileAtomicSync(target, "replacement"), failure => failure === error);
    assert.equal(fs.readFileSync(target, "utf8"), "original");
    assert.deepEqual(fs.readdirSync(dir), ["config.json"]);
  } finally {
    rename.mock.restore();
    syncBuiltinESMExports();
  }
});

test("exclusive temp creation does not follow or remove an existing temp", () => {
  const dir = tempDir("atomic-exclusive");
  const target = join(dir, "config.json");
  let collision;
  const originalOpen = fs.openSync;
  const open = mock.method(fs, "openSync", (path, flags, mode) => {
    if (flags === "wx") {
      collision = path;
      const fd = originalOpen(path, "w", mode);
      fs.writeFileSync(fd, "not ours");
      fs.closeSync(fd);
    }
    return originalOpen(path, flags, mode);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => writeFileAtomicSync(target, "new"), { code: "EEXIST" });
    assert.equal(fs.readFileSync(collision, "utf8"), "not ours");
    assert.equal(fs.existsSync(target), false);
  } finally {
    open.mock.restore();
    syncBuiltinESMExports();
  }
});
