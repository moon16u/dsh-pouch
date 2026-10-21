import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as plugin from "../lib/index.js";

test("package, bundle and type declarations share the dsh-hooks identity", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const patch = readFileSync(new URL("../cordis.patch.yml", import.meta.url), "utf8");
  const types = readFileSync(new URL("../lib/types/index.d.ts", import.meta.url), "utf8");
  assert.equal(manifest.name, "@moon16u/dsh-hooks");
  assert.equal(plugin.name, "dsh-hooks");
  assert.equal(plugin.entryId, plugin.name);
  assert.ok(patch.includes(`id: ${plugin.entryId}`));
  assert.ok(patch.includes(`name: '${manifest.name}'`));
  for (const field of ["name", "entryId"]) {
    assert.ok(types.includes(`export declare const ${field} = "${plugin[field]}";`));
  }
});

test("entry exposes command configuration only, without a second context producer", () => {
  assert.equal(plugin.name, "dsh-hooks");
  assert.equal(plugin.entryId, "dsh-hooks");
  assert.deepEqual(plugin.Config({}), { commandHooksEnabled: true, commandHooks: '{"version":1,"hooks":{}}' });
  for (const name of ["renderCoreMemory", "readCoreFiles", "coreMemoryMessage", "resolveConfig", "placeBlock", "contextDirectory"]) {
    assert.equal(plugin[name], undefined);
  }
  const schema = plugin.Config.toJSON();
  for (const field of ["coreDir", "files", "maxBytes", "enabled", "onStartup", "onResume", "onCompact", "subagents"]) {
    assert.ok(!Object.hasOwn(schema.dict ?? {}, field));
  }
});

test("mount delegates to official subprocess without registering legacy memory events", () => {
  const dependencies = [];
  plugin.apply({ inject: (deps) => dependencies.push(deps), on: () => assert.fail("no legacy listeners") }, {});
  assert.deepEqual(dependencies, [["subprocess"]]);
});

test("file-only master disable is retained", () => {
  assert.equal(plugin.Config({ commandHooksEnabled: false }).commandHooksEnabled, false);
});
