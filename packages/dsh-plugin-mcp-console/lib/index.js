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
 * plugin stays dormant instead of blocking the whole dsh-pouch bundle. The
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
import { homedir } from "node:os";
import { resolve, parse, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

/** Cordis plugin name used by loader diagnostics. */
export const name = "mcp-console";

/** Settings namespace the master switches live under (provider contract: [a-z0-9-]). */
export const MCP_CONSOLE_SETTINGS_NAMESPACE = "mcp-console";

/** Plugin config: master switches, editable from the settings GUI. */
export const Config = z.object({
  /** Master switch: routes + MCP fibers + SSE (stores are never touched). */
  enabled: z.boolean().default(true),
  /** Register the model-facing system-prompt announcement. */
  announceToAgent: z.boolean().default(true),
});

/** Resolve a raw config value (any shape) onto the switch defaults. */
export function resolveConfig(value) {
  return {
    enabled: value?.enabled !== false,
    announceToAgent: value?.announceToAgent !== false,
  };
}

/**
 * Register this optional settings consumer on both the current provider API
 * (`settings.installSection`, dsh-settings >= 0.1.2) and the pre-0.1.2
 * `register` surface used by older hosts/tests. Same helper as the sibling
 * pouch plugins — kept verbatim so behavior cannot drift between packages.
 */
function installSettingsSection(ctx, ns, schema, entry, hooks) {
  ctx.inject(["settings"], (settingsCtx) => {
    const settings = settingsCtx.settings;
    if (typeof settings?.installSection === "function") {
      settings.installSection(ctx, ns, schema, entry, hooks);
      return;
    }
    if (typeof settings?.register !== "function") return;
    const scope = settings.register(ns, schema, {
      base: entry,
      ...(hooks.validate === void 0 ? {} : { validate: hooks.validate }),
    });
    hooks.setSource(() => scope.get());
    settingsCtx.effect?.(() => () => {
      if (ctx.fiber?.state === 4 || ctx.fiber?.state === 5) return;
      hooks.setSource(() => entry);
      hooks.onChange();
    });
    hooks.onChange();
    scope.watch(() => {
      if (ctx.fiber?.state === 4 || ctx.fiber?.state === 5) return;
      hooks.onChange();
    });
  });
}

/**
 * Model-facing announcement (borrowed from dsh-skills-mcp-manager): tells
 * every agent the console exists, so MCP-management requests land in the
 * settings page instead of hand-edited config files.
 */
const SYSTEM_PROMPT_GUIDANCE =
  "本机已安装 MCP 控制台插件(dsh-plugin-mcp-console):DSH Web 设置页「MCP 服务器」分区可管理全部 MCP 服务器——" +
  "新增/编辑/删除、启用/停用、逐工具开关、mcpServers JSON 导入、连接测试。启用的服务器经官方 " +
  "@deepseek-ai/dsh-mcp-client 真实连接,工具名为 mcp__<服务器名>__<工具名>;被逐工具停用的工具仍会出现在工具" +
  "列表中,但调用会被拒绝并提示去设置页开启。配置由插件持久化在 ~/.dsh/dsh-mcp.json,无需也不应手改 " +
  "cordis.patch.yml。用户提到「MCP 服务器 / MCP 管理 / 导入 MCP / 测试 MCP 连接」时,引导其到设置页的 " +
  "「MCP 服务器」分区操作。";

/** System-prompt band this announcement sits in (after plugin guidance basics). */
const ANNOUNCEMENT_ORDER = 160;

export function apply(ctx, config) {
  const entry = resolveConfig(config);
  let current = () => entry;

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
    const orchestrator = new Orchestrator(scope, { globalStore, onChange: () => notify() });

    // 项目工作区自动感知：
    // 1. 优先排除法 (process.cwd() 不是家目录或根目录)
    // 2. 降级读取 DSH 本身存储的当前活跃工作区 (~/.dsh/storages/workspace.json)
    try {
      let activeWorkspace = null;
      const cwd = process.cwd();
      const home = homedir();
      const isHomeOrRoot = !cwd || resolve(cwd) === resolve(home) || resolve(cwd) === parse(cwd).root;
      if (!isHomeOrRoot && existsSync(cwd)) {
        activeWorkspace = cwd;
      } else {
        const wsStoragePath = join(home, ".dsh", "storages", "workspace.json");
        if (existsSync(wsStoragePath)) {
          const raw = JSON.parse(readFileSync(wsStoragePath, "utf8"));
          const workspaces = raw?.tables?.workspaces;
          if (workspaces && typeof workspaces === "object") {
            const list = Object.values(workspaces);
            list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
            const target = list.find((w) => w.path && existsSync(w.path) && resolve(w.path) !== resolve(home));
            if (target) activeWorkspace = target.path;
          }
        }
      }

      if (activeWorkspace) {
        const projStore = new Store(projectStorePath(activeWorkspace));
        orchestrator.setProjectStore(projStore, activeWorkspace);
      }
    } catch {
      // 容错降级：保持 global-only
    }

    const routes = registerRoutes(scope, {
      orchestrator,
      uiStore: globalStore,
      getPluginConfig: () => resolveConfig(current()),
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

    // Fallback poll (5s): bridges status transitions that emit no events —
    // chiefly "connecting -> failed" when a server never produces tools.
    // notify() dedups identical snapshots, so the poll is silent when idle.
    let settleTimer = null;
    settleTimer = setInterval(() => notify(), 5000);
    if (typeof settleTimer.unref === "function") settleTimer.unref();

    scope.effect(() => {
      void orchestrator.bootstrap().then(() => notify());
      return () => {
        clearInterval(settleTimer);
        routes.dispose();
      };
    }, "mcp-console: composition");
  }

  // Registered AFTER the surface state exists: the pre-0.1.2 helper fires
  // onChange synchronously during registration, which must find sync() ready.
  installSettingsSection(ctx, MCP_CONSOLE_SETTINGS_NAMESPACE, Config, entry, {
    setSource: (source) => {
      current = source;
    },
    onChange: () => sync(),
  });

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
