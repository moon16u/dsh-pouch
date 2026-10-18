/**
 * Host-side entry for @moon16u/dsh-plugin-mcp-console.
 *
 * A thin composition root (plan §4): Store (persistence) + Orchestrator
 * (dynamic assembly of the official `@deepseek-ai/dsh-mcp-client`) +
 * Status (observation) + Routes (loopback HTTP API + SSE).
 *
 * The MCP protocol itself is never implemented here — every connection, tool
 * registration and reconnect belongs to the official client plugin, loaded
 * one fiber per server through `ctx.plugin()`.
 *
 * Surface wiring uses dynamic `ctx.inject(...)` scopes rather than a static
 * `inject` export: on a host without the web profile (no webServer) the
 * plugin stays dormant instead of blocking the host. The
 * same mechanism powers the settings-GUI master switches (borrowed from
 * dsh-skills-mcp-manager): `enabled` tears the composition (routes + MCP
 * fibers) up and down live, `announceToAgent` toggles the model-facing
 * system-prompt announcement — both editable from the settings GUI through
 * the official settings provider, persisted in its user document.
 */
import z from "@deepseek-ai/schemastery";
import { Store, globalStorePath, projectStorePath } from "./store.js";
import { Orchestrator } from "./orchestrator.js";
import { computeSnapshot } from "./status.js";
import { registerRoutes } from "./routes.js";
import { defaultProfilePatchYamlPath } from "./yamlMigrator.js";
import { ConsoleAggregate } from "./aggregate.js";

/** Cordis plugin name used by loader diagnostics. */
export const name = "mcp-console";

/** Settings namespace the master switches live under (provider contract: [a-z0-9-]). */
export const MCP_CONSOLE_SETTINGS_NAMESPACE = "mcp-console";

/** Plugin config: master switches, editable from the settings GUI.
 *
 * rc.2 (dsh-settings schema-driven): `SettingsForms` discovers this schema from
 * the plugin's `export const Config`, and only `.volatile()` fields are editable
 * in the GUI — a volatile field is hot-updated in place on the config reference
 * the fiber already holds, without a fiber restart. */
export const Config = z.object({
  /** Master switch: routes + MCP fibers + SSE (stores are never touched). */
  enabled: z.boolean().default(true).volatile(),
  /** Register the model-facing system-prompt announcement. */
  announceToAgent: z.boolean().default(true).volatile(),
});

/** Unwrap a cosmokit volatile reference (rc.2 volatile config) to its current
 * value; plain values (tests, non-volatile hosts) pass through unchanged. */
function unwrapValue(v) {
  return v !== null && typeof v === "object" && typeof v.get === "function" ? v.get() : v;
}

/** Resolve a raw config value (plain or volatile refs) onto the switch defaults. */
export function resolveConfig(value) {
  return {
    enabled: unwrapValue(value?.enabled) !== false,
    announceToAgent: unwrapValue(value?.announceToAgent) !== false,
  };
}

/**
 * Model-facing announcement (borrowed from dsh-skills-mcp-manager): tells
 * every agent the console exists, so MCP-management requests land in the
 * settings page instead of hand-edited config files.
 */
const SYSTEM_PROMPT_GUIDANCE =
  "An MCP console plugin (dsh-plugin-mcp-console) is installed on this machine: the \"MCP Servers\" " +
  "section of the DSH Web settings page manages all MCP servers — add/edit/delete, enable/disable, " +
  "per-tool toggles, mcpServers JSON import, and connection testing. Enabled servers connect for real " +
  "via the official @deepseek-ai/dsh-mcp-client, with tools named mcp__<server>__<tool>; tools disabled " +
  "per-tool still appear in the tool list, but calls are rejected with a hint to enable them in the " +
  "settings page. The plugin persists its config in ~/.dsh/dsh-mcp.json — no need to hand-edit, and do " +
  "not hand-edit, cordis.patch.yml. When the user mentions \"MCP servers / MCP management / import MCP / " +
  "test MCP connection\", guide them to the \"MCP Servers\" section of the settings page.";

/** System-prompt band this announcement sits in (after plugin guidance basics). */
const ANNOUNCEMENT_ORDER = 160;

export function apply(ctx, config) {
  // rc.2: `config` may carry cosmokit volatile refs whose values hot-update in
  // place; keep `current` pointing at it so resolveConfig() reads live values.
  let current = () => config;
  const globalStore = new Store(globalStorePath());

  /** Live surfaces, each an inject fiber that can be torn down and rebuilt. */
  let compositionFiber = null;
  let announcementFiber = null;
  /** Serializes surface switches behind in-flight disposals (rapid toggles). */
  let syncChain = Promise.resolve();
  let booted = false;

  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function warn(error) {
    ctx.logger.warn(`mcp-console: settings sync failed: ${errorMessage(error)}`);
  }

  async function quietDispose(fiber) {
    try {
      await fiber.dispose();
    } catch {
      // unload races are reaped by context teardown
    }
  }

  /**
   * Converge the live surfaces onto the resolved switches. All decisions and
   * creations happen synchronously BEFORE the first await: a paused step must
   * never re-read the shared fiber slots after resuming (a later step may
   * have rebuilt them meanwhile), so disposals run from captured locals last.
   */
  async function syncStep() {
    const value = resolveConfig(current());
    const wantAnnouncement = value.enabled && value.announceToAgent;
    const toDispose = [];
    if (wantAnnouncement && !announcementFiber) {
      announcementFiber = ctx.inject(["systemPrompt"], (scope) => {
        scope.systemPrompt.section({
          name: "plugin:mcp-console",
          order: ANNOUNCEMENT_ORDER,
          text: SYSTEM_PROMPT_GUIDANCE,
        });
      });
    } else if (!wantAnnouncement && announcementFiber) {
      toDispose.push(announcementFiber);
      announcementFiber = null;
    }
    if (value.enabled && !compositionFiber) {
      compositionFiber = ctx.inject(["webServer", "tools"], buildComposition);
    } else if (!value.enabled && compositionFiber) {
      toDispose.push(compositionFiber);
      compositionFiber = null;
    }
    for (const fiber of toDispose) {
      await quietDispose(fiber);
    }
  }

  /**
   * The first pass runs synchronously up to its first await (surface
   * creation), so the composition exists by the time apply() returns even
   * when the pre-0.1.2 settings helper fires onChange during registration.
   * Later passes serialize fully behind the previous step's disposals, so a
   * rapid off/on never overlaps two live compositions on one route prefix.
   */
  function sync() {
    if (!booted) {
      booted = true;
      syncChain = Promise.resolve(syncStep()).catch(warn);
      return;
    }
    syncChain = syncChain.then(syncStep).catch(warn);
  }

  /**
   * The console's whole host-side surface: HTTP API + SSE, the per-tool
   * guard, status observation and the fiber ledger. Everything is created
   * from the injected scope, so disposing the inject fiber tears it all
   * down (routes closed, every MCP fiber disposed, guard lifted).
   */
  function buildComposition(scope) {
    const globalStore = new Store(globalStorePath());
    const projects = new Map();
    /** Every name a project console owns, so the global view never calls it external. */
    const projectNames = () => projects.size === 0 ? [] : [...projects.values()].flatMap((value) => [...value.orchestrator.storedServers().keys()]);
    let routes;
    const orchestrator = new Orchestrator(scope, {
      globalStore,
      onChange: () => routes.notify(),
      // A project server in any live session registers tools inside that
      // agent's scope, which inherits the global layer: the same public
      // name would collide there, so global adds must see those names.
      reservedNames: projectNames,
      // Project servers are managed by their own console; the global view
      // must not list them as read-only "external instances".
      ownedElsewhere: projectNames,
    });

    function projectOrchestrator(sessionId) {
      const agents = typeof scope.get === "function" ? scope.get("agents") : scope.agents;
      const directories = typeof scope.get === "function" ? scope.get("workingDirectory") : scope.workingDirectory;
      const agent = sessionId && agents?.get?.(sessionId);
      const root = agent && directories?.get?.(agent.session);
      if (!agent || !root || !agent.ctx) return null;
      let value = projects.get(agent.id);
      if (!value || value.root !== root) {
        void value?.orchestrator.close();
        const store = new Store(projectStorePath(root));
        const onChange = () => routes.notify();
        const created = new Orchestrator(agent.ctx, {
          globalStore: store,
          profileYamlPath: defaultProfilePatchYamlPath(),
          onChange,
          // `createScope()` keys the agent scope by the Agent object itself,
          // not its id; tools.schemas(scope) and scopeOf(fiber.ctx) both use
          // that object identity.
          scopeKey: agent,
          ingestProfile: false,
          projectOnly: true,
          defaultScope: "project",
        });
        created.setProjectStore(store, root);
        // The project console sees the global servers as another console's,
        // not as foreign fibers; the aggregate merges both lists for the UI.
        created.ownedElsewhere = () => [...orchestrator.storedServers().keys()];
        // The global layer is inherited by this agent's scope, so a name the
        // global console already owns cannot be registered here too.
        created.reservedNames = () => [...orchestrator.storedServers().keys()];
        // Per-tool denials for this project's servers apply only to this
        // agent: the guard is registered through the agent's own scope.
        try {
          agent.ctx.tools.guard((execution) => created.toolGuard(execution));
        } catch {
          // an agent scope already unwinding: the guard would not survive
        }
        void created.bootstrap();
        value = { root, orchestrator: created };
        projects.set(agent.id, value);
      }
      return new ConsoleAggregate(orchestrator, value.orchestrator);
    }

    routes = registerRoutes(scope, {
      orchestrator,
      uiStore: globalStore,
      getPluginConfig: () => resolveConfig(current()),
      resolveOrchestrator: projectOrchestrator,
    });

    const notify = () => routes.notify();

    // Per-tool disable (mcp-manager-gui-spec §3.4): a plain-context guard
    // applies globally — the official dsh-tools contract for masking a tool
    // for every agent. Disposed automatically with this scope.
    scope.tools.guard((execution) => orchestrator.toolGuard(execution));

    // Status change sources (plan §5.3): tool registrations anywhere,
    // lifecycle transitions of OUR fibers, and a fallback timer while any
    // managed server is mid-connect (zero tools inside the grace window).
    scope.on("tools/change", () => notify());
    scope.on("internal/status", (fiber) => {
      for (const entry of orchestrator.ledger.values()) {
        if (entry.fiber === fiber) {
          notify();
          return;
        }
      }
    });
    scope.on("agent/disposed", () => {
      for (const [id, value] of projects) {
        const agents = typeof scope.get === "function" ? scope.get("agents") : scope.agents;
        if (!agents?.get?.(id)) {
          void value.orchestrator.close();
          projects.delete(id);
        }
      }
      notify();
    });

    // Fallback poll (5s): bridges status transitions that emit no events —
    // chiefly "connecting -> failed" when a server never produces tools.
    // notify() dedups identical snapshots, so the poll is silent when idle.
    let settleTimer = null;
    settleTimer = setInterval(() => notify(), 5000);
    if (typeof settleTimer.unref === "function") settleTimer.unref();

    scope.effect(() => {
      void orchestrator.bootstrap().then(() => notify());
      return () => {
        void orchestrator.close();
        for (const value of projects.values()) void value.orchestrator.close();
        projects.clear();
        clearInterval(settleTimer);
        routes.dispose();
      };
    }, "mcp-console: composition");
  }

  // rc.2 settings: SettingsForms discovers this plugin's schema from
  // `export const Config` (above); the volatile switches are hot-updated in
  // place on the `config` reference this fiber holds, so no registration call
  // is needed and `current` keeps reading the live value. A GUI edit emits
  // `settings/document-updated`; re-sync on it — sync() is idempotent and
  // resolveConfig() reads the latest volatile value.
  // A real cordis context has `on`; the fake ctx in unit tests omits it.
  if (typeof ctx.on === "function") ctx.on("settings/document-updated", () => sync());

  sync();
}

export { Store, globalStorePath, projectStorePath } from "./store.js";
export { Orchestrator, ConsoleError } from "./orchestrator.js";
export { computeSnapshot } from "./status.js";
export { parseMcpServers } from "./import.js";
export { registerRoutes, ROUTE_PREFIX, sanitizeUi } from "./routes.js";
export { validateServerConfig, toClientConfig } from "./clientAdapter.js";
export {
  ingestProfileMcpEntries,
  exportStoreToProfileYaml,
  formatMcpYamlEntry,
  defaultProfilePatchYamlPath,
} from "./yamlMigrator.js";
