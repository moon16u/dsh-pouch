import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../lib/store.js";
import {
  ingestProfileMcpEntries,
  exportStoreToProfileYaml,
  formatMcpYamlEntry,
  defaultProfilePatchYamlPath,
} from "../lib/yamlMigrator.js";

const SAMPLE_YAML = [
  "# Your patch layer for this dsh profile, applied after every bundle layer:",
  "# a top-level YAML array of loader patch entries.",
  "",
  "# dsh-mode-boost: measured-boost reasoning-mode router, host-plane plugin.",
  "- insert:",
  "    - id: mode-boost",
  "      name: '@dsh-external/dsh-mode-boost'",
  "      config: {}",
  "",
  "# dsh-mcp-tavily: workspace-local Tavily MCP server",
  "- insert:",
  "    - id: mcp-tavily",
  "      name: '@deepseek-ai/dsh-mcp-client'",
  "      config:",
  "        serverName: tavily",
  "        transport: stdio",
  "        command: bash",
  "        args:",
  "          - /home/user/.agents/mcp/tavily-mcp.sh",
  "        failOnStartupError: false",
  "",
  "# dsh-mcp-firecrawl: workspace-local Firecrawl MCP server",
  "- insert:",
  "    - id: mcp-firecrawl",
  "      name: '@deepseek-ai/dsh-mcp-client'",
  "      config:",
  "        serverName: firecrawl",
  "        transport: stdio",
  "        command: bash",
  "        args:",
  "          - /home/user/.agents/mcp/firecrawl-mcp.sh",
  "        env:",
  "          FIRECRAWL_KEY: abc123",
  "        failOnStartupError: false",
  "",
].join("\n");

function fixture(initialYaml) {
  const dir = mkdtempSync(join(tmpdir(), "mcp-console-yaml-"));
  const yamlPath = join(dir, "cordis.patch.yml");
  if (initialYaml !== undefined) writeFileSync(yamlPath, initialYaml, "utf8");
  const store = new Store(join(dir, "dsh-mcp.json"));
  return { dir, yamlPath, store };
}

test("defaultProfilePatchYamlPath points at the web profile patch layer", () => {
  assert.match(defaultProfilePatchYamlPath(), /profiles[/\\]web[/\\]cordis\.patch\.yml$/);
});

test("ingest extracts MCP blocks, keeps other plugins and comments", async () => {
  const { dir, yamlPath, store } = fixture(SAMPLE_YAML);
  const result = await ingestProfileMcpEntries({ store, yamlPath });

  assert.deepEqual(result.ingested.sort(), ["firecrawl", "tavily"]);
  assert.equal(result.cleanedYaml, true);

  // store got full configs (name stripped, like every other store writer)
  const servers = store.read().servers;
  assert.equal(servers.tavily.name, undefined);
  assert.equal(servers.tavily.transport, "stdio");
  assert.equal(servers.tavily.command, "bash");
  assert.deepEqual(servers.tavily.args, ["/home/user/.agents/mcp/tavily-mcp.sh"]);
  assert.equal(servers.tavily.enabled, true);
  assert.equal(servers.firecrawl.env.FIRECRAWL_KEY, "abc123");

  // YAML keeps mode-boost + its comment, loses MCP blocks AND their header
  // comments (no orphaned "# dsh-mcp-x" lines)
  const after = readFileSync(yamlPath, "utf8");
  assert.match(after, /mode-boost/);
  assert.match(after, /@dsh-external\/dsh-mode-boost/);
  assert.match(after, /# dsh-mode-boost/);
  assert.doesNotMatch(after, /mcp-client/);
  assert.doesNotMatch(after, /serverName/);
  assert.doesNotMatch(after, /# dsh-mcp-tavily/);
  assert.doesNotMatch(after, /# dsh-mcp-firecrawl/);
  assert.match(after, /Your patch layer/);

  // ingest is a deliberate migration: no backup file is kept
  assert.equal(existsSync(`${yamlPath}.bak`), false);

  rmSync(dir, { recursive: true, force: true });
});

test("ingest is idempotent: second run finds nothing to migrate", async () => {
  const { dir, yamlPath, store } = fixture(SAMPLE_YAML);
  await ingestProfileMcpEntries({ store, yamlPath });
  const second = await ingestProfileMcpEntries({ store, yamlPath });
  assert.deepEqual(second.ingested, []);
  assert.equal(second.cleanedYaml, false);
  rmSync(dir, { recursive: true, force: true });
});

test("ingest leaves a missing file alone", async () => {
  const { dir, yamlPath, store } = fixture(undefined);
  const result = await ingestProfileMcpEntries({ store, yamlPath });
  assert.deepEqual(result, { ingested: [], skipped: [], cleanedYaml: false });
  rmSync(dir, { recursive: true, force: true });
});

test("ingest keeps an unparseable MCP block in the YAML (nothing lost)", async () => {
  const broken = [
    "# header comment",
    "- insert:",
    "    - id: mcp-broken",
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "      config: {}",
    "",
  ].join("\n");
  const { dir, yamlPath, store } = fixture(broken);
  const result = await ingestProfileMcpEntries({ store, yamlPath });
  assert.deepEqual(result.ingested, []);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "entry has no serverName");
  const after = readFileSync(yamlPath, "utf8");
  assert.match(after, /mcp-client/); // stayed put
  rmSync(dir, { recursive: true, force: true });
});

test("ingest does not overwrite an existing store entry", async () => {
  const { dir, yamlPath, store } = fixture(SAMPLE_YAML);
  store.mutate((servers) => {
    servers.tavily = { transport: "stdio", command: "custom-command", enabled: false };
  });
  const result = await ingestProfileMcpEntries({ store, yamlPath });
  assert.deepEqual(result.ingested, ["firecrawl"]);
  assert.ok(result.skipped.some((item) => item.name === "tavily"));
  const servers = store.read().servers;
  assert.equal(servers.tavily.command, "custom-command");
  assert.equal(servers.tavily.enabled, false);
  rmSync(dir, { recursive: true, force: true });
});

test("export renders standard mcp-client entries and is re-runnable", async () => {
  const { dir, yamlPath, store } = fixture("# existing layer\n- insert:\n    - id: other\n      name: 'x'\n");
  store.mutate((servers) => {
    servers.tavily = {
      enabled: true,
      transport: "stdio",
      command: "bash",
      args: ["/opt/tavily.sh"],
      env: { KEY: "a'b" },
      cwd: "",
      scope: "global",
      toolCallTimeoutMs: 30000,
      failOnStartupError: true,
      disabledTools: [],
    };
  });
  const result = await exportStoreToProfileYaml({ store, yamlPath });
  assert.deepEqual(result.exported, ["tavily"]);

  const after = readFileSync(yamlPath, "utf8");
  assert.match(after, /Exported by dsh-mcp-console/);
  assert.match(after, /serverName: tavily/);
  assert.match(after, /command: bash/);
  assert.match(after, /- \/opt\/tavily\.sh/);
  assert.match(after, /KEY: 'a''b'/); // single-quote escaped
  assert.match(after, /failOnStartupError: true/);
  assert.match(after, /toolCallTimeoutMs: 30000/);
  // pre-existing layer untouched
  assert.match(after, /- id: other/);

  // re-export does not duplicate the block
  await exportStoreToProfileYaml({ store, yamlPath });
  const twice = readFileSync(yamlPath, "utf8");
  assert.equal(twice.match(/serverName: tavily/g).length, 1);

  // and the exported YAML round-trips through ingest
  var store2 = new Store(join(dir, "fresh.json"));
  const round = await ingestProfileMcpEntries({ store: store2, yamlPath });
  assert.deepEqual(round.ingested, ["tavily"]);
  assert.equal(store2.read().servers.tavily.command, "bash");
  assert.deepEqual(store2.read().servers.tavily.args, ["/opt/tavily.sh"]);

  rmSync(dir, { recursive: true, force: true });
});

test("export with an empty store is a no-op", async () => {
  const { dir, yamlPath, store } = fixture("# only comments\n");
  const result = await exportStoreToProfileYaml({ store, yamlPath });
  assert.deepEqual(result.exported, []);
  assert.equal(readFileSync(yamlPath, "utf8"), "# only comments\n");
  rmSync(dir, { recursive: true, force: true });
});

test("formatMcpYamlEntry handles streamable-http configs", () => {
  const text = formatMcpYamlEntry("remote", {
    transport: "streamable-http",
    url: "http://127.0.0.1:3001/mcp",
    headers: { Authorization: "Bearer x" },
    toolCallTimeoutMs: 60000,
    failOnStartupError: false,
  });
  assert.match(text, /transport: streamable-http/);
  assert.match(text, /url: http:\/\/127\.0\.0\.1:3001\/mcp/);
  assert.match(text, /Authorization: Bearer x/);
});

test("ingest handles multiple MCP entries under one insert and keeps non-MCP siblings", async () => {
  const yaml = [
    "# file header comment",
    "",
    "# keep me: unrelated plugin",
    "- insert:",
    "    - id: other",
    "      name: 'x'",
    "",
    "# one insert, two MCP entries plus one unrelated",
    "- insert:",
    "    - id: mcp-a",
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "      config:",
    "        serverName: alpha",
    "        transport: stdio",
    "        command: npx",
    "    - id: unrelated",
    "      name: 'y'",
    "      config: {}",
    "    - id: mcp-b",
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "      config:",
    "        serverName: beta",
    "        transport: stdio",
    "        command: uvx",
    "",
  ].join("\n");
  const { dir, yamlPath, store } = fixture(yaml);
  const result = await ingestProfileMcpEntries({ store, yamlPath });
  assert.deepEqual(result.ingested.sort(), ["alpha", "beta"]);
  const servers = store.read().servers;
  assert.equal(servers.alpha.command, "npx");
  assert.equal(servers.beta.command, "uvx");

  const after = readFileSync(yamlPath, "utf8");
  // unrelated entries survive: both the standalone one and the sibling
  assert.match(after, /- id: other/);
  assert.match(after, /- id: unrelated/);
  // the partially-migrated item keeps its insert shell
  assert.match(after, /- insert:/);
  // MCP entries and the file header comment are handled correctly
  assert.doesNotMatch(after, /serverName/);
  assert.match(after, /# file header comment/);
  assert.match(after, /# keep me: unrelated plugin/);
  rmSync(dir, { recursive: true, force: true });
});

test("ingest never eats the following block's header comment", async () => {
  const yaml = [
    "# mcp one comment",
    "- insert:",
    "    - id: mcp-one",
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "      config:",
    "        serverName: one",
    "        transport: stdio",
    "        command: npx",
    "",
    "# keep: next plugin comment",
    "- insert:",
    "    - id: kept-plugin",
    "      name: 'z'",
    "      config: {}",
    "",
  ].join("\n");
  const { dir, yamlPath, store } = fixture(yaml);
  await ingestProfileMcpEntries({ store, yamlPath });
  const after = readFileSync(yamlPath, "utf8");
  assert.match(after, /# keep: next plugin comment/); // neighbour's comment survives
  assert.doesNotMatch(after, /# mcp one comment/);    // own comment goes with the block
  assert.match(after, /kept-plugin/);
  rmSync(dir, { recursive: true, force: true });
});
