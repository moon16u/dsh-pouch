import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { globalStorePath, projectStorePath, Store } from "../lib/store.js";
import { resolutionBases, validateServerConfig, toClientConfig } from "../lib/clientAdapter.js";
import { defaultProfilePatchYamlPath, exportStoreToProfileYaml, ingestProfileMcpEntries } from "../lib/yamlMigrator.js";
import { tempDir } from "./helpers/temp.mjs";

function withHome(value, fn) {
  const original = process.env.DSH_HOME;
  if (value === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = value;
  try { return fn(); } finally {
    if (original === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = original;
  }
}

test("all plugin home paths use the official blank, tilde and relative override rules", () => {
  for (const value of [undefined, "", " \t ", "~", "~/dsh test", "~\\dsh test", "./relative dsh"]) {
    withHome(value, () => {
      const expected = resolveDshHome();
      assert.equal(globalStorePath(), join(expected, "dsh-mcp.json"));
      assert.equal(defaultProfilePatchYamlPath(), join(expected, "profiles", "web", "cordis.patch.yml"));
      if (value === undefined || value.trim() === "") assert.equal(expected, join(homedir(), ".dsh"));
    });
  }
  withHome("ignored", () => {
    assert.equal(globalStorePath("./explicit"), join(resolve("./explicit"), "dsh-mcp.json"));
    assert.equal(defaultProfilePatchYamlPath("~/custom"), join(homedir(), "custom", "profiles", "web", "cordis.patch.yml"));
  });
});

test("linked profile directories resolve on POSIX and Windows junctions", () => {
  const root = tempDir("profile paths # percent%");
  const home = join(root, "dsh home");
  const actualProfile = join(root, "actual profile");
  const modules = join(actualProfile, "node_modules");
  mkdirSync(modules, { recursive: true });
  mkdirSync(join(home, "profiles"), { recursive: true });
  symlinkSync(actualProfile, join(home, "profiles", "web"), process.platform === "win32" ? "junction" : "dir");
  withHome(home, () => {
    assert.deepEqual(resolutionBases(), [join(home, "profiles", "web", "node_modules")]);
  });
  assert.equal(projectStorePath(root), join(root, ".dsh", "mcp.json"));
});

test("actual client resolution imports file URLs from paths with spaces, # and %", async () => {
  const root = tempDir("module paths # percent%");
  const client = join(root, "profiles", "web", "node_modules", "@deepseek-ai", "dsh-mcp-client");
  const scope = join(root, "profiles", "web", "node_modules", "@deepseek-ai", "dsh-scope");
  for (const dir of [client, scope]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(client, "package.json"), JSON.stringify({ type: "module", main: "index.js" }));
  writeFileSync(join(client, "index.js"), 'export const name = "fixture-client";');
  writeFileSync(join(scope, "package.json"), JSON.stringify({ type: "module", main: "index.js" }));
  writeFileSync(join(scope, "index.js"), 'export const scopeOf = () => "fixture-scope";');
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = root;
  try {
    const url = new URL("../lib/clientAdapter.js", import.meta.url);
    url.searchParams.set("fixture", root);
    const adapter = await import(url.href);
    assert.equal((await adapter.resolveMcpClient()).name, "fixture-client");
    assert.equal(adapter.clientScopeOf({}), "fixture-scope");
    assert.ok(pathToFileURL(join(client, "index.js")).href.includes("%23"));
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
  }
});

for (const [platform, command, args, cwd] of [
  ["Windows", "C:\\Program Files\\nodejs\\node.exe", ["C:\\MCP Servers\\server.js", "C:\\Data\\a b"], "C:\\MCP Servers"],
  ["Windows UNC", "node", ["\\\\server\\share\\MCP tools\\server.js"], "\\\\server\\share\\MCP tools"],
  ["macOS", "/opt/homebrew/bin/node", ["/Users/test/MCP tools/server.js"], "/Users/test/MCP tools"],
]) {
  test(`${platform} commands and paths survive JSON, YAML and official client translation`, async () => {
    const root = tempDir("native-config");
    const store = new Store(join(root, "store.json"));
    const config = { name: "demo", transport: "stdio", command, args, cwd };
    const validated = validateServerConfig(config);
    assert.equal(validated.error, undefined);
    const official = toClientConfig(validated.config);
    assert.equal(official.command, command);
    assert.deepEqual(official.args, args);
    assert.equal(official.cwd, cwd);
    store.mutate(servers => { servers.demo = validated.config; });
    const yamlPath = join(root, "cordis.patch.yml");
    await exportStoreToProfileYaml({ store, yamlPath });
    // Windows editors commonly save CRLF. Preserve paths through ingestion.
    const yaml = readFileSync(yamlPath, "utf8").replace(/\r?\n/g, "\r\n");
    writeFileSync(yamlPath, yaml);
    const imported = new Store(join(root, "imported.json"));
    await ingestProfileMcpEntries({ store: imported, yamlPath });
    assert.equal(imported.read().servers.demo.command, command);
    assert.deepEqual(imported.read().servers.demo.args, args);
    assert.equal(imported.read().servers.demo.cwd, cwd);
  });
}
