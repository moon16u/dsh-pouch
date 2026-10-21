import { tempDir, recoverTempDir } from "./helpers/temp.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { ConsoleAggregate } from "../lib/aggregate.js";
import { Orchestrator } from "../lib/orchestrator.js";
import { Store } from "../lib/store.js";

/**
 * A project session's page must still manage the global servers. Regression:
 * the project console only knows its own scope, so it reported every global
 * fiber as a read-only "external instance" with no tool switches — the whole
 * global list became untouchable from inside a project session.
 */
function consoleWith(servers) {
  const root = tempDir("dsh-mcp-console-aggregate");
  const store = new Store(join(root, "store.json"));
  store.mutate((existing) => { Object.assign(existing, servers); });
  const ctx = {
    registry: { entries: () => [[undefined, { name: "mcp-client", fibers: [] }]][Symbol.iterator]() },
    tools: { schemas: () => [] },
    plugin: () => { throw new Error("no plugin in this test"); },
    logger: { warn() {}, error() {} },
  };
  const orchestrator = new Orchestrator(ctx, { globalStore: store, ingestProfile: false, scopeKey: "s" });
  orchestrator.__root = root;
  return orchestrator;
}
function cleanup(...orchestrators) {
  for (const item of orchestrators) recoverTempDir(item.__root);
}

const GLOBAL = { transport: "stdio", command: "node", enabled: true };

test("a project view keeps global servers manageable, not external", () => {
  const global = consoleWith({ anytxt: GLOBAL, exa: GLOBAL });
  const project = consoleWith({});
  // Mirrors the composition wiring: each console knows the other's names.
  global.ownedElsewhere = () => [...project.storedServers().keys()];
  project.ownedElsewhere = () => [...global.storedServers().keys()];

  const view = new ConsoleAggregate(global, project).snapshot();

  assert.deepEqual(view.servers.map((server) => server.name).sort(), ["anytxt", "exa"]);
  assert.deepEqual(view.externalServers, [], "global servers must never surface as external");
  assert.equal(view.hasProjectWorkspace, true);
  cleanup(global, project);
});

test("mutations are routed to the console that owns the name", () => {
  const global = consoleWith({ shared: GLOBAL });
  const project = consoleWith({ local: GLOBAL });
  const view = new ConsoleAggregate(global, project);

  assert.equal(view.consoleFor("local"), project, "project-owned names go to the project console");
  assert.equal(view.consoleFor("shared"), global, "everything else stays global");
  assert.equal(view.consoleFor("unknown"), global, "unknown names fall back to global");

  const names = view.storedServers();
  assert.deepEqual([...names.keys()].sort(), ["local", "shared"]);
  cleanup(global, project);
});

test("a name owned by both consoles is reported as one entry", () => {
  const global = consoleWith({ same: GLOBAL });
  const project = consoleWith({ same: GLOBAL });
  const view = new ConsoleAggregate(global, project);
  assert.equal(view.storedServers().size, 1);
  cleanup(global, project);
});

test("the aggregated snapshot carries a project root and merged errors", () => {
  const global = consoleWith({});
  const project = consoleWith({});
  project.setProjectStore(project.globalStore, join(project.__root, "example-project"));
  const view = new ConsoleAggregate(global, project).snapshot();
  assert.equal(view.projectWorkspaceRoot, join(project.__root, "example-project"));
  assert.deepEqual(view.storeErrors, []);
  cleanup(global, project);
});
