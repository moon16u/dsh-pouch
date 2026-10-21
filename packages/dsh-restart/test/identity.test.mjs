import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const manifest = JSON.parse(read("package.json"));

test("scoped package identity and self-referencing exports match the renamed directory", () => {
  assert.equal(manifest.name, "@moon16u/dsh-restart");
  assert.equal(manifest.repository.directory, "packages/dsh-restart");
  const require = createRequire(import.meta.url);
  for (const [suffix, file] of [
    ["", "lib/index.js"],
    ["/client", "lib/client.js"],
    ["/package.json", "package.json"],
    ["/cordis.patch.yml", "cordis.patch.yml"],
  ]) {
    assert.equal(require.resolve(manifest.name + suffix), fileURLToPath(new URL(file, root)));
  }
});

test("bundle patch resolves the renamed package while preserving the runtime plugin id", () => {
  const patch = read("cordis.patch.yml");
  assert.equal(patch.match(/^\s+name:\s*'([^']+)'$/m)?.[1], manifest.name);
  assert.match(patch, /^\s+- id: dsh-restart$/m);
});

test("browser module loader registers the same identity as the package manifest", () => {
  let registration;
  runInNewContext(read("lib/client.js"), {
    window: { __ModuleLoader__: { load(value) { registration = value; } } },
  });
  assert.equal(registration.id, manifest.name);
  assert.equal(typeof registration.factory, "function");
});

test("lockfiles and platform workflow refer to the renamed package", () => {
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(lock.name, manifest.name);
  assert.equal(lock.packages[""].name, manifest.name);
  assert.match(read("../../pnpm-lock.yaml"), /^  packages\/dsh-restart:$/m);
  const workflow = read("../../.github/workflows/restart-platforms.yml");
  assert.ok(workflow.includes("'packages/dsh-restart/**'"));
  assert.ok(workflow.includes("packages/dsh-restart/test/native-integration.test.mjs"));
});
