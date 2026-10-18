/** Serialized configuration and lifecycle owner for one registration scope. */
import { resolveMcpClient, toClientConfig, validateServerConfig, clientScopeOf } from "./clientAdapter.js";
import { ingestProfileMcpEntries, defaultProfilePatchYamlPath } from "./yamlMigrator.js";

/** cordis FiberState values (const enum, not exported at runtime). */
export const FiberState = {
  PENDING: 0,
  LOADING: 1,
  ACTIVE: 2,
  FAILED: 3,
  DISPOSED: 4,
  UNLOADING: 5,
};

/** Official initial sync window (default toolCallTimeoutMs) plus slack. */
export const CONNECT_GRACE_MS = 75000;

/**
 * Hard budget for one side-fiber probe (ms). Generous vs the official
 * initial-sync window: a stdio server may need a cold npx/uvx download.
 */
export const PROBE_TIMEOUT_MS = 15000;

/** Error with a stable machine-readable code mapped to an HTTP status. */
export class ConsoleError extends Error {
  /**
   * @param {"invalid"|"conflict"|"not_found"|"internal"} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class Orchestrator {
  /**
   * @param {import("@deepseek-ai/cordis").Context} ctx owning context; fibers
   *        created from it are disposed automatically when it unloads.
   * @param {object} options
   * @param {import("./store.js").Store} options.globalStore
   * @param {() => void} options.onChange invoked (already throttled upstream)
   *        after any state mutation worth broadcasting.
   * @param {string} [options.profileYamlPath] profile patch layer to ingest.
   */
  constructor(ctx, { globalStore, onChange, profileYamlPath, scopeKey, ingestProfile = true, reservedNames = () => [], ownedElsewhere = () => [], projectOnly = false, defaultScope = projectOnly ? "project" : "global" }) {
    this.ctx = ctx;
    this.scopeKey = scopeKey;
    this.ingestProfile = ingestProfile;
    this.reservedNames = reservedNames;
    this.ownedElsewhere = ownedElsewhere;
    this.projectOnly = projectOnly;
    this.defaultScope = defaultScope;
    this.closed = false;
    this.globalStore = globalStore;
    this.projectStore = null;
    this.projectRoot = null;
    this.onChange = onChange ?? (() => {});
    /** @type {Map<string, object>} serverName -> ledger entry */
    this.ledger = new Map();
    /** Resolved official client module (set by bootstrap). */
    this.mcpClient = null;
    /** Resolution failure of the official client, surfaced to the panel. */
    this.clientError = null;
    this._chain = Promise.resolve();
    /** Profile patch layer ingested into the store (auto-ingest engine). */
    this.profileYamlPath = profileYamlPath ?? defaultProfilePatchYamlPath();
    /** Last ingest failure, surfaced to the panel (never silently dropped). */
    this.ingestError = null;
    /**
     * Live index of per-tool disabled PUBLIC tool names across all servers,
     * read by the execution guard (mcp-manager-gui-spec §3.4: a disabled tool
     * stays registered but its calls are denied).
     */
    this.disabledToolSet = new Set();
  }

  /** Rebuild the global disabled-tool index from the stores. */
  rebuildDisabledToolSet() {
    const set = new Set();
    for (const config of this.storedServers().values()) {
      if (Array.isArray(config.disabledTools)) {
        for (const name of config.disabledTools) {
          if (name.startsWith(`mcp__${config.name}__`) && !this.namespaceConflict(config.name)) set.add(name);
        }
      }
    }
    this.disabledToolSet = set;
  }

  /**
   * The execution guard: denies calls to tools disabled per-tool in the
   * panel. Registered once by the composition root (plain-context guards
   * apply globally — the official dsh-tools contract).
   */
  toolGuard(execution) {
    const name = execution?.name;
    if (typeof name === "string" && this.disabledToolSet.has(name)) {
      return `mcp-console: tool "${name}" is disabled (toggle it in the MCP settings section)`;
    }
    return undefined;
  }

  /** Attach (or detach) the project-scope store following the session workspace. */
  setProjectStore(store, root) {
    this.projectStore = store ?? null;
    this.projectRoot = root ?? null;
  }

  /** All configured servers across scopes (stored configs, no live status). */
  storedServers() {
    const out = new Map();
    if (!this.projectOnly) {
      for (const [name, config] of Object.entries(this.globalStore.read().servers)) {
        out.set(name, { ...config, name, scope: "global" });
      }
    }
    if (this.projectStore) {
      for (const [name, config] of Object.entries(this.projectStore.read().servers)) {
        out.set(name, { ...config, name, scope: "project" });
      }
    }
    return out;
  }

  storeFor(scope) {
    if (this.projectOnly) return this.projectStore ?? this.globalStore;
    return scope === "project" ? this.projectStore : this.globalStore;
  }

  /** Snapshot every globally registered tool name. */
  toolNamesSnapshot() {
    try {
      return new Set(this.ctx.tools.schemas(this.scopeKey).map((schema) => schema.name));
    } catch {
      return new Set();
    }
  }

  /**
   * Every live mcp-client serverName (this console's ledger plus external
   * instances). Attribution itself is prefix-only; this scan exists for the
   * conflict pre-check and the external-server listing.
   */
  liveServerNames() {
    const names = new Set(this.ledger.keys());
    try {
      for (const [, runtime] of this.ctx.registry.entries()) {
        if (runtime?.name !== "mcp-client") continue;
        for (const fiber of runtime.fibers) {
          const owner = fiber?.ctx ? clientScopeOf(fiber.ctx) : undefined;
          if (owner !== undefined && owner !== this.scopeKey) continue;
          if (fiber?.state === FiberState.DISPOSED) continue;
          const serverName = fiber?.config?.serverName;
          if (typeof serverName === "string") names.add(serverName);
        }
      }
    } catch {
      // registry shape drift: prefix matching against the ledger still applies
    }
    return names;
  }

  /**
   * Live tool names attributed to one server: the official naming contract is
   * `mcp__<serverName>__<rawName>` and lossy normalization never touches the
   * server prefix (invalid characters are replaced and truncation shortens
   * only the raw-name tail before the 12-hex identity hash is appended), so a
   * prefix match is exact and total. A load-time registry diff is deliberately
   * NOT used: it cannot tell this server's tools from unrelated tools that
   * registered while the fiber was starting (host plugin tools such as
   * `sidebar_open`, other servers at boot), so it smuggles foreign tools into
   * the card.
   */
  toolsOf(name, currentNames) {
    return this.attributeTools(name, currentNames ?? this.toolNamesSnapshot());
  }

  /**
   * Prefix-only attribution from a registry snapshot. Shared by the snapshot
   * path and the side-fiber probe, which owns no ledger entry.
   */
  attributeTools(name, current) {
    if (this.namespaceConflict(name)) return [];
    const prefix = `mcp__${name}__`;
    const names = [];
    for (const toolName of current) {
      if (toolName.startsWith(prefix)) names.push(toolName);
    }
    return names.sort();
  }

  namespaceConflict(name) {
    const names = new Set([...this.storedServers().keys(), ...this.liveServerNames(), ...this.reservedNames()]);
    for (const other of names) {
      if (other !== name && (other.startsWith(name + "__") || name.startsWith(other + "__"))) {
        return `ambiguous server namespaces "${name}" and "${other}"; rename one before connecting or toggling tools`;
      }
    }
    return null;
  }

  validateDisabledTools(config) {
    for (const tool of config.disabledTools) {
      if (!tool.startsWith(`mcp__${config.name}__`)) throw new ConsoleError("invalid", "disabledTools may only name this server's tools");
    }
    const conflict = this.namespaceConflict(config.name);
    if (conflict) throw new ConsoleError("conflict", conflict);
  }

  /**
   * serverNames currently held by mcp-client fibers OUTSIDE this console:
   * manual profile declarations and any other dynamic assembly. Derived from
   * the live fiber registry — the authoritative runtime source.
   */
  externalServerNames() {
    const names = new Set();
    try {
      for (const [, runtime] of this.ctx.registry.entries()) {
        if (runtime?.name !== "mcp-client") continue;
        for (const fiber of runtime.fibers) {
          const owner = fiber?.ctx ? clientScopeOf(fiber.ctx) : undefined;
          if (owner !== undefined && owner !== this.scopeKey) continue;
          if (fiber?.state === FiberState.DISPOSED) continue;
          const serverName = fiber?.config?.serverName;
          if (typeof serverName === "string") names.add(serverName);
        }
      }
    } catch {
      // registry shape drift: external names simply read empty until it heals
    }
    for (const name of this.ledger.keys()) names.delete(name);
    // Servers another console instance already owns are that instance's to
    // manage; listing them here would label them "external" and offer no
    // controls, which is how a project view once showed the whole global
    // list as read-only.
    for (const name of this.ownedElsewhere()) names.delete(name);
    return names;
  }

  /**
   * Take over one mcp-client fiber the loader started for a profile YAML
   * entry we just ingested: dispose it so our own loadOne can claim the
   * serverName (the official client's namespace reservation is per app
   * root, and both sides share the same module instance).
   */
  async disposeExternalFiber(name) {
    try {
      for (const [, runtime] of this.ctx.registry.entries()) {
        if (runtime?.name !== "mcp-client") continue;
        for (const fiber of runtime.fibers) {
          const owner = fiber?.ctx ? clientScopeOf(fiber.ctx) : undefined;
          if (owner !== undefined && owner !== this.scopeKey) continue;
          if (fiber?.config?.serverName === name && !this.ledger.has(name) && fiber.state !== FiberState.DISPOSED) {
            await fiber.dispose();
            return true;
          }
        }
      }
    } catch (error) {
      this.ctx.logger.warn(`mcp-console: taking over "${name}" raised ${errorMessage(error)}`);
    }
    return false;
  }

  /**
   * Auto-ingest engine (dsh-mcp-ingest-export-plan §2.2): move profile-YAML
   * MCP entries into the store and take over their live fibers. Safe to call
   * repeatedly — a clean YAML is a no-op.
   */
  async ingestFromProfile() {
    if (!this.ingestProfile) return { ingested: [], skipped: [] };
    let result;
    try {
      result = await ingestProfileMcpEntries({ store: this.globalStore, yamlPath: this.profileYamlPath });
    } catch (error) {
      this.ingestError = errorMessage(error);
      this.ctx.logger.error(`mcp-console: profile ingest failed: ${this.ingestError}`);
      return { ingested: [], skipped: [] };
    }
    this.ingestError = result.skipped.length ? result.skipped.map(item => `${item.name}: ${item.reason}`).join("; ") : null;
    for (const name of result.ingested) {
      await this.disposeExternalFiber(name);
    }
    return result;
  }

  /**
   * Pre-check one serverName before assembly (plan §5.2): shape, ledger
   * duplicate, external conflicts. Returns an error string or null.
   */
  precheck(name) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) {
      return `serverName "${name}" must match [A-Za-z0-9_-]{1,32}`;
    }
    const ambiguity = this.namespaceConflict(name);
    if (ambiguity) return ambiguity;
    if (this.ledger.has(name)) return `serverName "${name}" is already managed by this console`;
    const external = this.externalServerNames();
    if (external.has(name)) {
      return `serverName "${name}" is already in use by an mcp-client instance outside this console (check profile cordis config / other managers)`;
    }
    return null;
  }

  /** Load every enabled server from the stores. Called once at plugin start. */
  bootstrap() {
    return this.run(async () => {
      await this.ingestFromProfile();
      await this.reconcileNow(true);
    });
  }

  reconcile(retry = false) {
    return this.run(() => this.reconcileNow(retry));
  }

  async reconcileNow(retry = false) {
    const stored = this.storedServers();
    for (const name of [...this.ledger.keys()]) {
      if (!stored.has(name) || stored.get(name).enabled === false) await this.disposeOne(name);
    }
    for (const [name, raw] of stored) {
      if (raw.enabled === false) continue;
      const { config, error } = validateServerConfig(raw);
      const entry = this.ledger.get(name);
      const invalid = error ?? this.namespaceConflict(name);
      if (invalid) {
        if (entry) await this.disposeOne(name);
        this.ledger.set(name, { fiber: null, config: raw, error: invalid, pending: false, loadedAt: 0 });
        continue;
      }
      const broken = !entry?.fiber ||
        entry.pending ||
        entry.error ||
        entry.fiber.state === FiberState.FAILED ||
        entry.fiber.state === FiberState.DISPOSED ||
        (Date.now() - entry.loadedAt >= CONNECT_GRACE_MS && this.toolsOf(name).length === 0);
      const comparable = c => JSON.stringify({ ...c, disabledTools: [] });
      const changed = entry && comparable(entry.config) !== comparable(config);
      if (!entry || changed || (retry && broken)) {
        const conflict = !entry ? this.precheck(name) : null;
        if (conflict) {
          this.ledger.set(name, { fiber: null, config, error: conflict, pending: false, loadedAt: 0 });
        } else if (entry) await this.swapFiber(entry, config);
        else await this.loadOne(name, config);
      } else if (entry) entry.config = config;
    }
    this.rebuildDisabledToolSet();
    this.onChange();
  }

  close() {
    this.closed = true;
    const stopping = [...this.ledger.values()].map(entry => entry.fiber?.dispose?.());
    return Promise.allSettled(stopping).then(() => this._chain).then(async () => {
      for (const name of [...this.ledger.keys()]) await this.disposeOne(name);
      this.onChange();
    });
  }

  /** Serialized mutators: each returns the API-facing result. */

  run(operation) {
    const next = this._chain.then(() => {
      if (this.closed) throw new ConsoleError("internal", "MCP console is stopping");
      return operation();
    });
    // keep the chain alive even when an operation rejects
    this._chain = next.then(() => {}, () => {});
    return next;
  }

  add(rawServer) {
    return this.run(async () => {
      const { config, error } = validateServerConfig({ ...rawServer, scope: rawServer?.scope ?? this.defaultScope });
      if (error) throw new ConsoleError("invalid", error);
      if (config.scope === "project" && !this.projectStore) {
        throw new ConsoleError("invalid", "project scope is unavailable: no session workspace is attached");
      }
      const store = this.storeFor(config.scope) ?? this.globalStore;
      const existing = this.storedServers();
      if (existing.has(config.name)) {
        throw new ConsoleError("conflict", `serverName "${config.name}" already exists; edit it instead`);
      }
      if (this.projectOnly) config.scope = "project";
      const conflict = this.precheck(config.name);
      if (conflict) throw new ConsoleError("conflict", conflict);
      this.validateDisabledTools(config);
      this.persistServer(config);
      this.rebuildDisabledToolSet();
      if (config.enabled !== false) await this.loadOne(config.name, config);
      this.onChange();
      return { config: this.publicConfig(config) };
    });
  }

  update(name, patch) {
    return this.run(async () => {
      const existing = this.storedServers().get(name);
      if (!existing) throw new ConsoleError("not_found", `unknown server "${name}"`);
      const merged = { ...existing, ...patch, name: patch?.name ?? name };
      if (merged.name !== name) throw new ConsoleError("invalid", "renaming a server is not supported; remove and re-add");
      if (merged.scope === "project" && !this.projectStore) {
        throw new ConsoleError("invalid", "project scope is unavailable: no session workspace is attached");
      }
      // masked round-trip: the panel sends "••••" for unchanged secrets and
      // "" for "remove this entry" — resolve both against the stored values.
      if (patch && Object.hasOwn(patch, "env")) merged.env = mergeMasked(existing.env, patch.env);
      if (patch && Object.hasOwn(patch, "headers")) merged.headers = mergeMasked(existing.headers, patch.headers);
      const { config, error } = validateServerConfig(merged);
      if (error) throw new ConsoleError("invalid", error);
      if (this.projectOnly) config.scope = "project";
      this.validateDisabledTools(config);
      const entry = this.ledger.get(name);
      // A pure per-tool toggle (disabledTools only) needs no fiber reload:
      // the execution guard reads the live index.
      const toolsOnlyPatch =
        patch !== null &&
        typeof patch === "object" &&
        Object.keys(patch).length === 1 &&
        Array.isArray(patch.disabledTools);
      if (toolsOnlyPatch) {
        this.persistServer(config);
        this.rebuildDisabledToolSet();
        this.onChange();
        return { config: this.publicConfig(config) };
      }
      this.persistServer(config);
      if (config.scope !== existing.scope) {
        const oldStore = this.storeFor(existing.scope);
        try {
          oldStore?.mutate(servers => { delete servers[name]; });
        } catch (error) {
          this.storeFor(config.scope).mutate(servers => { delete servers[name]; });
          throw error;
        }
      }
      if (!config.enabled) await this.disposeOne(name);
      else if (entry) await this.swapFiber(entry, config);
      else await this.loadOne(name, config);
      this.rebuildDisabledToolSet();
      this.onChange();
      return { config: this.publicConfig(config) };
    });
  }

  remove(name) {
    return this.run(async () => {
      const existing = this.storedServers().get(name);
      if (!existing) throw new ConsoleError("not_found", `unknown server "${name}"`);
      await this.disposeOne(name);
      const store = this.storeFor(existing.scope) ?? this.globalStore;
      store.mutate((servers) => {
        delete servers[name];
      });
      this.rebuildDisabledToolSet();
      this.onChange();
      return { removed: name };
    });
  }

  setEnabled(name, enabled) {
    return this.run(async () => {
      const existing = this.storedServers().get(name);
      if (!existing) throw new ConsoleError("not_found", `unknown server "${name}"`);
      if (enabled) {
        if (this.ledger.has(name) && !this.ledger.get(name).error && this.ledger.get(name).fiber?.state === FiberState.ACTIVE) return { name, enabled };
        const { config, error } = validateServerConfig({ ...existing, enabled: true });
        if (error) throw new ConsoleError("invalid", error);
        if (this.projectOnly) config.scope = "project";
        this.validateDisabledTools(config);
        this.persistServer(config);
        const entry = this.ledger.get(name);
        if (entry) await this.swapFiber(entry, config);
        else {
          const conflict = this.precheck(name);
          if (conflict) throw new ConsoleError("conflict", conflict);
          await this.loadOne(name, config);
        }
      } else {
        await this.disposeOne(name);
        this.persistServer({ ...existing, enabled: false });
      }
      this.onChange();
      return { name, enabled };
    });
  }

  reconnect(name) {
    return this.run(async () => {
      const raw = this.storedServers().get(name);
      if (!raw) throw new ConsoleError("not_found", `unknown server "${name}"`);
      if (raw.enabled === false) throw new ConsoleError("invalid", "enable the server before reconnecting");
      const { config, error } = validateServerConfig(raw);
      if (error) throw new ConsoleError("invalid", error);
      this.validateDisabledTools(config);
      const entry = this.ledger.get(name);
      if (entry) await this.swapFiber(entry, config);
      else await this.loadOne(name, config);
      this.onChange();
      if (this.ledger.get(name)?.error) throw new ConsoleError("internal", this.ledger.get(name).error);
      return { name };
    });
  }

  /**
   * Side-fiber connectivity probe ("Test connection", borrowed from
   * dsh-skills-mcp-manager): load ONE throwaway official-client fiber with
   * `failOnStartupError: true`, await its startup handshake, count the tools
   * it registered, then always dispose it. Zero MCP protocol code — the
   * handshake itself belongs to the official client, so the console's red
   * line holds.
   *
   * A server whose fiber is currently live cannot be re-probed (the official
   * client reserves the serverName namespace per module instance); for those
   * the probe honestly reports the live status instead (`live: true`).
   *
   * Serialized through the mutation chain: the probe owns a real fiber and
   * must never race a load/dispose of the same namespace.
   *
   * @param {string} name stored server name
   * @param {object} [options]
   * @param {number} [options.timeoutMs] hard probe budget (default 15s)
   * @returns {Promise<{ok: boolean, live: boolean, toolCount: number, latencyMs: number|null, error: string|null}>}
   */
  probe(name, { timeoutMs = PROBE_TIMEOUT_MS } = {}) {
    return this.run(async () => {
      const stored = this.storedServers().get(name);
      if (!stored) throw new ConsoleError("not_found", `unknown server "${name}"`);
      const { config, error } = validateServerConfig(stored);
      if (error) {
        return { ok: false, live: false, toolCount: 0, latencyMs: 0, error };
      }
      const ambiguity = this.namespaceConflict(name);
      if (ambiguity) return { ok: false, live: false, toolCount: 0, latencyMs: 0, error: ambiguity };
      const entry = this.ledger.get(name);
      if (entry && entry.fiber && entry.fiber.state !== FiberState.DISPOSED) {
        // Namespace reserved by the live fiber: report, do not collide.
        const tools = this.toolsOf(name);
        const ok = !entry.error && entry.fiber.state === FiberState.ACTIVE && tools.length > 0;
        return {
          ok,
          live: true,
          toolCount: tools.length,
          latencyMs: null,
          error: ok ? null : (entry.error ?? "live but no tools registered"),
        };
      }
      const started = Date.now();
      let fiber = null;
      let timer = null;
      try {
        if (!this.mcpClient) this.mcpClient = await resolveMcpClient();
        // force failOnStartupError: the probe must hear about a failed handshake
        const probeConfig = { ...this.clientConfig(config), failOnStartupError: true };
        fiber = this.ctx.plugin(this.mcpClient, probeConfig);
        await new Promise((resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`probe timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
          Promise.resolve(fiber).then(resolve, reject);
        });
        // the tool count is prefix-only, so no registry diff is needed
        const toolCount = this.attributeTools(name, this.toolNamesSnapshot()).length;
        return { ok: true, live: false, toolCount, latencyMs: Date.now() - started, error: null };
      } catch (probeError) {
        return {
          ok: false,
          live: false,
          toolCount: 0,
          latencyMs: Date.now() - started,
          error: errorMessage(probeError),
        };
      } finally {
        if (timer) clearTimeout(timer);
        if (fiber && fiber.state !== FiberState.DISPOSED) {
          try {
            await fiber.dispose();
          } catch {
            // probe already reported; context teardown reaps the rest
          }
        }
      }
    });
  }

  /**
   * Panel refresh (mcp-manager-gui-spec §3.1): re-examine health and tool
   * lists. Managed servers that read as failed (startup error, or connected
   * with zero tools past the grace window) are restarted; everything else
   * just re-derives its live snapshot.
   */
  refresh() {
    return this.run(async () => {
      const ingest = await this.ingestFromProfile();
      await this.reconcileNow(true);
      return {
        restarted: [...this.ledger].filter(([, entry]) => !entry.error).map(([name]) => name),
        failed: [...this.ledger].filter(([, entry]) => entry.error).map(([name, entry]) => ({ name, error: entry.error })),
        ingested: ingest.ingested,
      };
    });
  }

  /**
   * Import parsed servers (from mcpServers JSON). Existing names are skipped
   * and reported, never overwritten (plan §5.5).
   * @param {{ name: string, config: object }[]} parsed
   */
  importServers(parsed) {
    return this.run(async () => {
      const added = [];
      const skipped = [];
      for (const { name, config } of parsed) {
        const { config: validated, error } = validateServerConfig({ ...config, name });
        if (error) {
          skipped.push({ name, reason: error });
          continue;
        }
        if (this.storedServers().has(validated.name) || added.some((item) => item.name === validated.name)) {
          skipped.push({ name: validated.name, reason: "name already exists" });
          continue;
        }
        const conflict = this.precheck(validated.name);
        if (conflict) {
          skipped.push({ name: validated.name, reason: conflict });
          continue;
        }
        try { this.validateDisabledTools(validated); } catch (error) { skipped.push({ name, reason: error.message }); continue; }
        this.persistServer(validated);
        if (validated.enabled !== false) await this.loadOne(validated.name, validated);
        added.push(this.publicConfig(validated));
      }
      this.rebuildDisabledToolSet();
      this.onChange();
      return { added, skipped };
    });
  }

  // ── internals ───────────────────────────────────────────────────────────

  persistServer(config) {
    const store = this.storeFor(config.scope) ?? this.globalStore;
    const { name, ...rest } = config;
    store.mutate((servers) => {
      Object.defineProperty(servers, name, { value: rest, enumerable: true, configurable: true, writable: true });
    });
  }

  clientConfig(config) {
    const value = toClientConfig(config);
    if (config.scope === "project" && value.transport === "stdio" && !value.cwd) value.cwd = this.projectRoot;
    return value;
  }

  async loadOne(name, config) {
    const entry = {
      fiber: null,
      config,
      error: null,
      pending: true,
      loadedAt: Date.now(),
    };
    this.ledger.set(name, entry);
    try {
      if (!this.mcpClient) this.mcpClient = await resolveMcpClient();
      if (this.closed) throw new Error("MCP console is stopping");
      const fiber = this.ctx.plugin(this.mcpClient, this.clientConfig(config));
      entry.fiber = fiber;
      const settled = typeof fiber.await === "function" ? await fiber.await() : await fiber;
      entry.fiber = settled ?? fiber;
      entry.pending = false;
      entry.loadedAt = Date.now();
      entry.error = null;
      this.clientError = null;
    } catch (error) {
      entry.pending = false;
      entry.error = errorMessage(error);
      if (!this.mcpClient) this.clientError = entry.error;
      if (entry.fiber && entry.fiber.state !== FiberState.DISPOSED) {
        try {
          await entry.fiber.dispose();
        } catch {
          // a failed startup fiber that refuses disposal is left to
          // context teardown; the ledger entry keeps the error either way
        }
      }
      entry.fiber = null;
    }
    return entry;
  }

  /** Hot-swap an existing fiber's config (update/reconnect both land here). */
  async swapFiber(entry, config) {
    entry.pending = true;
    entry.config = config;
    try {
      if (entry.fiber && entry.fiber.state !== FiberState.DISPOSED) await entry.fiber.dispose();
      const fresh = await this.loadOne(config.name, config);
      if (fresh.error) throw new Error(fresh.error);
    } catch (error) {
      entry.error = errorMessage(error);
      entry.pending = false;
      // Retain a disposal failure rather than create an overlapping connection.
    }
  }

  async disposeOne(name) {
    const entry = this.ledger.get(name);
    this.ledger.delete(name);
    if (!entry) return;
    if (entry.fiber && entry.fiber.state !== FiberState.DISPOSED) {
      try {
        await entry.fiber.dispose();
      } catch (error) {
        this.ctx.logger.warn(`mcp-console: disposing "${name}" raised ${errorMessage(error)}`);
      }
    }
  }

  /** Stored config with secret-shaped values masked, for API responses. */
  publicConfig(config) {
    const out = { ...config };
    if (out.env) out.env = maskValues(out.env);
    if (out.headers) out.headers = maskValues(out.headers);
    return out;
  }
}

function maskValues(record) {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = typeof value === "string" && value.length > 0 ? "••••" : value;
  }
  return out;
}

/**
 * Merge a masked record coming from the panel with the stored secrets:
 * `MASK` keeps the stored value, `""` removes the entry, anything else
 * replaces it.
 */
export function mergeMasked(stored, incoming) {
  const out = {};
  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (value === "••••") {
      if (!Object.hasOwn(stored ?? {}, key)) throw new ConsoleError("invalid", `no stored secret for ${key}`);
      Object.defineProperty(out, key, { value: stored[key], enumerable: true, configurable: true, writable: true });
      continue;
    }
    if (value === "" || value === null || value === undefined) delete out[key];
    else out[key] = String(value);
  }
  return out;
}
