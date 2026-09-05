/**
 * Orchestrator: the console's core. It owns the fiber ledger
 * (`Map<serverName, { fiber, config, toolNames, error, ... }>`) and every
 * lifecycle operation on the official `@deepseek-ai/dsh-mcp-client`:
 *
 *   load      ctx.plugin(mcpClient, config)   — one fiber per server
 *   update    fiber.update(newConfig)          — hot config swap
 *   disable   fiber.dispose()                  — disconnect + unregister tools
 *   enable    load again
 *   reconnect fiber.restart()
 *
 * The console implements ZERO MCP protocol code (plan red line): connection,
 * reconnect backoff, tool discovery, `mcp__` naming and image bridging are
 * all inherited from the official client.
 *
 * Concurrency: every mutating operation runs through a serialized promise
 * chain, because tool-ownership is observed by diffing the global tool
 * registry around each load (public names of tools whose raw names are too
 * long get hash-suffixed by the official client, so a plain prefix match is
 * not enough — the plan's §5.3 diff approach).
 *
 * Conflict pre-check (plan §5.2): before assembling a fiber, the serverName
 * is checked against (a) this ledger and (b) every LIVE mcp-client fiber in
 * the registry — which covers servers declared manually in the profile's
 * cordis config, regardless of which physical copy of dsh-mcp-client loaded
 * them (this console vendors its own copy, so the official module-level
 * namespace reservation cannot see across copies; the registry scan can).
 */
import { resolveMcpClient, toClientConfig, validateServerConfig } from "./clientAdapter.js";
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
  constructor(ctx, { globalStore, onChange, profileYamlPath }) {
    this.ctx = ctx;
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
        for (const name of config.disabledTools) set.add(name);
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
    for (const [name, config] of Object.entries(this.globalStore.read().servers)) {
      out.set(name, { ...config, name, scope: config.scope === "project" ? "project" : "global" });
    }
    if (this.projectStore) {
      for (const [name, config] of Object.entries(this.projectStore.read().servers)) {
        out.set(name, { ...config, name, scope: "project" });
      }
    }
    return out;
  }

  storeFor(scope) {
    return scope === "project" ? this.projectStore : this.globalStore;
  }

  /** Snapshot every globally registered tool name. */
  toolNamesSnapshot() {
    try {
      return new Set(this.ctx.tools.schemas().map((schema) => schema.name));
    } catch {
      return new Set();
    }
  }

  /**
   * Every live mcp-client serverName (this console's ledger plus external
   * instances). Tool names are attributed by prefix first; the load-time
   * diff only covers hash-suffixed names the prefix cannot see.
   */
  liveServerNames() {
    const names = new Set(this.ledger.keys());
    try {
      for (const [, runtime] of this.ctx.registry.entries()) {
        if (runtime?.name !== "mcp-client") continue;
        for (const fiber of runtime.fibers) {
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
   * Live tool names attributed to one server: prefix matches (`mcp__<name>__`)
   * plus names captured by this server's load diff that no OTHER live
   * server's prefix owns — the diff alone cannot distinguish tools that
   * OTHER servers registered concurrently during the load window (which
   * happens at boot, when profile-declared entries start beside us).
   */
  toolsOf(name, currentNames) {
    const current = currentNames ?? this.toolNamesSnapshot();
    const entry = this.ledger.get(name);
    return this.attributeTools(name, current, entry ? entry.toolNames : new Set());
  }

  /**
   * Attribute live tool names to one server from a registry snapshot plus a
   * load-time diff set (prefix first, then unclaimed diff names). Shared by
   * the snapshot path and the side-fiber probe, which owns no ledger entry.
   */
  attributeTools(name, current, captured) {
    const prefix = `mcp__${name}__`;
    const foreignPrefixes = [];
    for (const other of this.liveServerNames()) {
      if (other !== name) foreignPrefixes.push(`mcp__${other}__`);
    }
    const names = [];
    for (const toolName of current) {
      if (toolName.startsWith(prefix)) {
        names.push(toolName);
        continue;
      }
      if (!captured.has(toolName)) continue;
      if (foreignPrefixes.some((foreign) => toolName.startsWith(foreign))) continue;
      names.push(toolName);
    }
    return names.sort();
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
          const serverName = fiber?.config?.serverName;
          if (typeof serverName === "string") names.add(serverName);
        }
      }
    } catch {
      // registry shape drift: external names simply read empty until it heals
    }
    for (const name of this.ledger.keys()) names.delete(name);
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
          if (fiber?.config?.serverName === name && !this.ledger.has(name)) {
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
    let result;
    try {
      result = await ingestProfileMcpEntries({ store: this.globalStore, yamlPath: this.profileYamlPath });
    } catch (error) {
      this.ingestError = errorMessage(error);
      this.ctx.logger.error(`mcp-console: profile ingest failed: ${this.ingestError}`);
      return { ingested: [], skipped: [] };
    }
    this.ingestError = null;
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
    if (this.ledger.has(name)) return `serverName "${name}" is already managed by this console`;
    const external = this.externalServerNames();
    if (external.has(name)) {
      return `serverName "${name}" is already in use by an mcp-client instance outside this console (check profile cordis config / other managers)`;
    }
    return null;
  }

  /** Load every enabled server from the stores. Called once at plugin start. */
  async bootstrap() {
    this.rebuildDisabledToolSet();
    await this.ingestFromProfile();
    try {
      this.mcpClient = await resolveMcpClient();
    } catch (error) {
      this.clientError = errorMessage(error);
      this.ctx.logger.error(`mcp-console: ${this.clientError}`);
      this.onChange();
      return;
    }
    const stored = this.storedServers();
    for (const [name, raw] of stored) {
      if (raw.enabled === false) continue;
      const { config, error } = validateServerConfig(raw);
      if (error) {
        this.ledger.set(name, { fiber: null, config: raw, toolNames: new Set(), error, pending: false, loadedAt: 0 });
        continue;
      }
      const conflict = this.precheck(name);
      if (conflict) {
        this.ledger.set(name, { fiber: null, config, toolNames: new Set(), error: conflict, pending: false, loadedAt: 0 });
        continue;
      }
      await this.loadOne(name, config);
    }
    this.onChange();
  }

  /** Serialized mutators: each returns the API-facing result. */

  run(operation) {
    const next = this._chain.then(operation);
    // keep the chain alive even when an operation rejects
    this._chain = next.then(() => {}, () => {});
    return next;
  }

  add(rawServer) {
    return this.run(async () => {
      const { config, error } = validateServerConfig(rawServer);
      if (error) throw new ConsoleError("invalid", error);
      if (config.scope === "project" && !this.projectStore) {
        throw new ConsoleError("invalid", "project scope is unavailable: no session workspace is attached");
      }
      const store = this.storeFor(config.scope) ?? this.globalStore;
      const existing = this.storedServers();
      if (existing.has(config.name)) {
        throw new ConsoleError("conflict", `serverName "${config.name}" already exists; edit it instead`);
      }
      const conflict = this.precheck(config.name);
      if (conflict) throw new ConsoleError("conflict", conflict);
      if (config.enabled !== false) await this.loadOne(config.name, config);
      this.persistServer(config);
      this.rebuildDisabledToolSet();
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
      if (patch && patch.env) merged.env = mergeMasked(existing.env, patch.env);
      if (patch && patch.headers) merged.headers = mergeMasked(existing.headers, patch.headers);
      const { config, error } = validateServerConfig(merged);
      if (error) throw new ConsoleError("invalid", error);
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
      if (entry && entry.fiber && config.enabled !== false) {
        await this.swapFiber(entry, config);
      } else if (entry && config.enabled === false) {
        await this.disposeOne(name);
      } else if (!entry && config.enabled !== false) {
        const conflict = this.precheck(name);
        if (conflict) throw new ConsoleError("conflict", conflict);
        await this.loadOne(name, config);
      }
      // scope migration: drop the entry from the store it is leaving, so a
      // global->project move never leaves a stale global copy that would
      // resurrect when the project store detaches
      if (config.scope !== existing.scope) {
        const oldStore = this.storeFor(existing.scope);
        if (oldStore && oldStore !== this.storeFor(config.scope)) {
          oldStore.mutate((servers) => {
            delete servers[name];
          });
        }
      }
      this.persistServer(config);
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
        if (this.ledger.has(name)) throw new ConsoleError("conflict", `server "${name}" is already enabled`);
        const { config, error } = validateServerConfig({ ...existing, enabled: true });
        if (error) throw new ConsoleError("invalid", error);
        const conflict = this.precheck(name);
        if (conflict) throw new ConsoleError("conflict", conflict);
        await this.loadOne(name, config);
        this.persistServer(config);
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
      const entry = this.ledger.get(name);
      if (!entry) throw new ConsoleError("not_found", `server "${name}" is not loaded`);
      if (!entry.fiber) throw new ConsoleError("invalid", entry.error ?? "server has no fiber to restart");
      await this.swapFiber(entry, entry.config);
      this.onChange();
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
        const probeConfig = { ...toClientConfig(config), failOnStartupError: true };
        const before = this.toolNamesSnapshot();
        fiber = this.ctx.plugin(this.mcpClient, probeConfig);
        await new Promise((resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`probe timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
          Promise.resolve(fiber).then(resolve, reject);
        });
        const after = this.toolNamesSnapshot();
        const captured = new Set([...after].filter((toolName) => !before.has(toolName)));
        const toolCount = this.attributeTools(name, after, captured).length;
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
      // sync config first: newly written profile-YAML entries become managed
      const ingest = await this.ingestFromProfile();
      for (const name of ingest.ingested) {
        const raw = this.storedServers().get(name);
        if (!raw || raw.enabled === false) continue;
        const { config, error } = validateServerConfig(raw);
        if (error) continue;
        const conflict = this.precheck(name);
        if (conflict) continue;
        await this.loadOne(name, config);
      }
      const restarted = [];
      for (const [name, entry] of [...this.ledger]) {
        const broken =
          entry.error !== null ||
          (entry.fiber !== null && !entry.pending && entry.fiber.state === FiberState.FAILED) ||
          (entry.fiber !== null && entry.fiber.state === FiberState.ACTIVE &&
            Date.now() - entry.loadedAt >= CONNECT_GRACE_MS && this.toolsOf(name).length === 0);
        if (broken && entry.fiber !== null) {
          await this.swapFiber(entry, entry.config);
          restarted.push(name);
        }
      }
      this.rebuildDisabledToolSet();
      this.onChange();
      return { restarted, ingested: ingest.ingested };
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
        await this.loadOne(validated.name, validated);
        this.persistServer(validated);
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
      servers[name] = rest;
    });
  }

  async loadOne(name, config) {
    const entry = {
      fiber: null,
      config,
      toolNames: new Set(),
      error: null,
      pending: true,
      loadedAt: Date.now(),
    };
    this.ledger.set(name, entry);
    try {
      if (!this.mcpClient) this.mcpClient = await resolveMcpClient();
      const before = this.toolNamesSnapshot();
      const fiber = this.ctx.plugin(this.mcpClient, toClientConfig(config));
      entry.fiber = fiber;
      await fiber;
      entry.pending = false;
      entry.loadedAt = Date.now();
      entry.error = null;
      const after = this.toolNamesSnapshot();
      entry.toolNames = new Set([...after].filter((toolName) => !before.has(toolName)));
    } catch (error) {
      entry.pending = false;
      entry.error = errorMessage(error);
      entry.toolNames = new Set();
      if (entry.fiber && entry.fiber.state !== FiberState.DISPOSED) {
        try {
          await entry.fiber.dispose();
        } catch {
          // a failed startup fiber that refuses disposal is left to
          // context teardown; the ledger entry keeps the error either way
        }
      }
    }
  }

  /** Hot-swap an existing fiber's config (update/reconnect both land here). */
  async swapFiber(entry, config) {
    const fiber = entry.fiber;
    const before = this.toolNamesSnapshot();
    entry.pending = true;
    entry.error = null;
    try {
      if (!this.mcpClient) this.mcpClient = await resolveMcpClient();
      if (fiber) {
        await fiber.update(toClientConfig(config));
      } else {
        const created = this.ctx.plugin(this.mcpClient, toClientConfig(config));
        entry.fiber = created;
        await created;
      }
      entry.config = config;
      entry.pending = false;
      entry.loadedAt = Date.now();
      const after = this.toolNamesSnapshot();
      entry.toolNames = new Set([...after].filter((toolName) => !before.has(toolName)));
    } catch (error) {
      entry.pending = false;
      entry.error = errorMessage(error);
      entry.toolNames = new Set();
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
  const out = { ...stored };
  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (value === "••••") continue;
    if (value === "" || value === null || value === undefined) delete out[key];
    else out[key] = String(value);
  }
  return out;
}
