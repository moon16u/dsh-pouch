/**
 * One manageable view over the global console and (when the request belongs to
 * a project session) that project's console.
 *
 * Both stores stay separate — a global server keeps living in
 * `~/.dsh/dsh-mcp.json`, a project server in `<project>/.dsh/mcp.json`, and a
 * project server still connects inside its own Agent scope. Only the *view*
 * is merged: without this, a project session's page listed every global
 * server as a read-only "external instance" with no tool switches, because
 * from the project instance's point of view those fibers belong to another
 * scope.
 *
 * Route selection is by ownership, never by guesswork: a name the project
 * store holds goes to the project console, everything else to the global one.
 */
import { computeSnapshot } from "./status.js";
import { ConsoleError } from "./orchestrator.js";

export class ConsoleAggregate {
  /**
   * @param {import("./orchestrator.js").Orchestrator} globalConsole
   * @param {import("./orchestrator.js").Orchestrator | null} projectConsole
   */
  constructor(globalConsole, projectConsole) {
    this.globalConsole = globalConsole;
    this.projectConsole = projectConsole;
  }

  get globalStore() { return this.globalConsole.globalStore; }
  get projectStore() { return this.projectConsole?.projectStore ?? null; }
  get projectRoot() { return this.projectConsole?.projectRoot ?? null; }
  get profileYamlPath() { return this.globalConsole.profileYamlPath; }
  get ingestError() {
    const errors = [this.globalConsole.ingestError, this.projectConsole?.ingestError].filter(Boolean);
    return errors.length > 0 ? errors.join("; ") : null;
  }
  get clientError() {
    return this.globalConsole.clientError ?? this.projectConsole?.clientError ?? null;
  }

  /** Merged ledger; project entries win on the (pre-checked) unique names. */
  get ledger() {
    const merged = new Map(this.globalConsole.ledger);
    for (const [name, entry] of this.projectConsole?.ledger ?? []) merged.set(name, entry);
    return merged;
  }

  get disabledToolSet() {
    const merged = new Set(this.globalConsole.disabledToolSet);
    for (const name of this.projectConsole?.disabledToolSet ?? []) merged.add(name);
    return merged;
  }

  /** The console owning a server name, or the global one when unknown. */
  consoleFor(name) {
    if (this.projectConsole?.storedServers().has(name)) return this.projectConsole;
    return this.globalConsole;
  }

  storedServers() {
    const merged = new Map(this.globalConsole.storedServers());
    for (const [name, config] of this.projectConsole?.storedServers() ?? []) merged.set(name, config);
    return merged;
  }

  toolNamesSnapshot() {
    const merged = new Set(this.globalConsole.toolNamesSnapshot());
    for (const name of this.projectConsole?.toolNamesSnapshot() ?? []) merged.add(name);
    return merged;
  }

  toolsOf(name, currentNames) {
    const current = currentNames ?? this.toolNamesSnapshot();
    return this.consoleFor(name).attributeTools(name, current);
  }

  attributeTools(name, current) {
    return this.consoleFor(name).attributeTools(name, current);
  }

  publicConfig(config) {
    return this.consoleFor(config.name).publicConfig(config);
  }

  namespaceConflict(name) {
    return this.globalConsole.namespaceConflict(name) ?? this.projectConsole?.namespaceConflict(name) ?? null;
  }

  externalServerNames() {
    const merged = new Set(this.globalConsole.externalServerNames());
    for (const name of this.projectConsole?.externalServerNames() ?? []) merged.add(name);
    for (const name of this.ledger.keys()) merged.delete(name);
    return merged;
  }

  // ── mutations: every one is routed to the console that owns the name ──────

  add(server) {
    const scope = server?.scope;
    if (scope === "project" && this.projectConsole) return this.projectConsole.add(server);
    if (scope === "project") {
      // The route layer maps ConsoleError codes onto statuses; a bare Error
      // would surface this caller mistake as an internal 500.
      return Promise.reject(new ConsoleError("invalid", "project scope is unavailable: no session workspace is attached"));
    }
    return this.globalConsole.add(server);
  }

  update(name, patch) {
    return this.consoleFor(name).update(name, patch);
  }

  remove(name) {
    return this.consoleFor(name).remove(name);
  }

  setEnabled(name, enabled) {
    return this.consoleFor(name).setEnabled(name, enabled);
  }

  reconnect(name) {
    return this.consoleFor(name).reconnect(name);
  }

  probe(name, options) {
    return this.consoleFor(name).probe(name, options);
  }

  importServers(parsed) {
    const global = [];
    const project = [];
    for (const item of parsed) (item.config?.scope === "project" ? project : global).push(item);
    if (project.length === 0) return this.globalConsole.importServers(global);
    if (!this.projectConsole) {
      const skipped = project.map((item) => ({ name: item.name, reason: "project scope is unavailable: no session workspace is attached" }));
      return this.globalConsole.importServers(global).then((result) => ({ ...result, skipped: [...result.skipped, ...skipped] }));
    }
    return Promise.all([this.globalConsole.importServers(global), this.projectConsole.importServers(project)]).then(
      ([left, right]) => ({
        added: [...left.added, ...right.added],
        skipped: [...left.skipped, ...right.skipped],
      }),
    );
  }

  async refresh() {
    const global = await this.globalConsole.refresh();
    const project = this.projectConsole ? await this.projectConsole.refresh() : { restarted: [], failed: [], ingested: [] };
    return {
      restarted: [...new Set([...global.restarted, ...project.restarted])],
      failed: [...global.failed, ...project.failed],
      ingested: [...new Set([...global.ingested, ...project.ingested])],
    };
  }

  snapshot() {
    const view = computeSnapshot(this.globalConsole);
    if (!this.projectConsole) return view;
    const project = computeSnapshot(this.projectConsole);
    // The project instance's "external" list is its own blind spot: those are
    // the global servers this aggregate already manages. Keep only names that
    // neither console owns.
    const owned = new Set(this.storedServers().keys());
    const external = new Map();
    for (const server of [...view.externalServers, ...project.externalServers]) {
      if (!owned.has(server.name)) external.set(server.name, server);
    }
    const servers = [...view.servers, ...project.servers].sort((left, right) => left.name.localeCompare(right.name));
    return {
      ...view,
      servers,
      externalServers: [...external.values()].sort((left, right) => left.name.localeCompare(right.name)),
      hasProjectWorkspace: true,
      projectWorkspaceRoot: project.projectWorkspaceRoot ?? this.projectConsole.projectRoot ?? null,
      storeErrors: [...new Set([...view.storeErrors, ...project.storeErrors])],
      clientError: view.clientError ?? project.clientError ?? null,
    };
  }
}
