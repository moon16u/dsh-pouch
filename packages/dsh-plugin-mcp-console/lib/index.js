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
 * Service wiring uses `ctx.inject(["webServer", "tools"], ...)` rather than a
 * static `inject` export: on a host without the web profile (no webServer)
 * the plugin stays dormant instead of blocking the whole dsh-pouch bundle.
 */
import { Store, globalStorePath, projectStorePath } from "./store.js";
import { Orchestrator } from "./orchestrator.js";
import { computeSnapshot } from "./status.js";
import { registerRoutes } from "./routes.js";
import { homedir } from "node:os";
import { resolve, parse, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

/** Cordis plugin name used by loader diagnostics. */
export const name = "mcp-console";

export function apply(ctx) {
  ctx.inject(["webServer", "tools"], (scope) => {
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

    const routes = registerRoutes(scope, { orchestrator, uiStore: globalStore });
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
  });
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
