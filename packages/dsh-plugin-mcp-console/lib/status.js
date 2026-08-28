/**
 * Status observation and aggregation (plan §5.3, MVP口径).
 *
 * State machine per server: `disabled` (configured, not enabled) → `loading`
 * (fiber starting) → `running` (fiber live AND tools registered) /
 * `connecting` (fiber live, zero tools, inside the grace window) → `failed`
 * (fiber FAILED, startup error, or zero tools after the grace window).
 *
 * Honest MVP caveats (documented in README known-limitations):
 * - "connecting" vs "reconnecting, attempt N" cannot be distinguished — the
 *   official client does not expose structured connection-level events yet.
 * - A connected server that legitimately exposes zero tools reads as
 *   "failed" after the grace window.
 *
 * Change sources: the global `tools/change` event (tool registration or
 * unregistration anywhere), fiber `internal/status` transitions for fibers
 * in our ledger, and a fallback timer while anything is mid-connect.
 */
import { FiberState, CONNECT_GRACE_MS } from "./orchestrator.js";

/**
 * Derive one server's status string from its ledger entry and live tools.
 * @param {object|undefined} entry ledger entry (undefined = not assembled)
 * @param {string[]} tools live tool names attributed to the server
 * @param {boolean} enabled whether the stored config has enabled !== false
 */
export function serverStatus(entry, tools, enabled) {
  if (!enabled) return "disabled";
  if (!entry) return "failed";
  if (entry.pending) return "loading";
  if (entry.error) return "failed";
  const state = entry.fiber ? entry.fiber.state : FiberState.DISPOSED;
  if (state === FiberState.FAILED) return "failed";
  if (state === FiberState.PENDING || state === FiberState.LOADING || state === FiberState.UNLOADING) {
    return "loading";
  }
  if (tools.length > 0) return "running";
  if (state === FiberState.ACTIVE) {
    return Date.now() - entry.loadedAt < CONNECT_GRACE_MS ? "connecting" : "failed";
  }
  return "failed";
}

/**
 * Full API snapshot: every stored server with live status, masked secrets,
 * tool lists, plus profile-declared (external) servers as read-only entries
 * with their live tool lists (mcp-manager-v1-review §2-4: read-only servers
 * render inline in the list with a badge, no delete, controls disabled).
 *
 * @param {import("./orchestrator.js").Orchestrator} orchestrator
 */
export function computeSnapshot(orchestrator) {
  const stored = orchestrator.storedServers();
  const currentTools = orchestrator.toolNamesSnapshot();
  const servers = [];
  for (const [name, config] of stored) {
    const entry = orchestrator.ledger.get(name);
    const liveTools = orchestrator.toolsOf(name, currentTools);
    const disabled = new Set(Array.isArray(config.disabledTools) ? config.disabledTools : []);
    const prefix = `mcp__${name}__`;
    const enabled = config.enabled !== false;
    const tools = liveTools.map((publicName) => ({
      name: publicName,
      label: publicName.startsWith(prefix) ? publicName.slice(prefix.length) : publicName,
      enabled: !disabled.has(publicName),
    }));
    const status = serverStatus(entry, liveTools, enabled);
    const view = orchestrator.publicConfig(config);
    servers.push({
      ...view,
      status,
      toolCount: liveTools.length,
      enabledToolCount: enabled ? tools.filter((tool) => tool.enabled).length : 0,
      tools,
      error: entry?.error ?? null,
    });
  }
  servers.sort((a, b) => a.name.localeCompare(b.name));

  const externalServers = [];
  for (const name of orchestrator.externalServerNames()) {
    const prefix = `mcp__${name}__`;
    const tools = [...currentTools]
      .filter((toolName) => toolName.startsWith(prefix))
      .sort()
      .map((publicName) => ({
        name: publicName,
        label: publicName.startsWith(prefix) ? publicName.slice(prefix.length) : publicName,
        enabled: true,
      }));
    externalServers.push({
      name,
      readOnly: true,
      enabled: true,
      status: tools.length > 0 ? "running" : "connecting",
      toolCount: tools.length,
      enabledToolCount: tools.length,
      tools,
      error: null,
    });
  }
  externalServers.sort((a, b) => a.name.localeCompare(b.name));

  return {
    version: 1,
    servers,
    externalServers,
    hasProjectWorkspace: Boolean(orchestrator.projectStore),
    projectWorkspaceRoot: orchestrator.projectRoot ?? null,
    storeErrors: [
      orchestrator.globalStore.lastError,
      orchestrator.projectStore?.lastError ?? null,
      orchestrator.ingestError,
    ].filter(Boolean),
    clientError: orchestrator.clientError ?? null,
  };
}

/** Group servers by status for the panel's sectioned list. */
export function groupByStatus(servers) {
  const groups = { running: [], connecting: [], loading: [], disabled: [], failed: [] };
  for (const server of servers) {
    (groups[server.status] ?? groups.failed).push(server);
  }
  return groups;
}
