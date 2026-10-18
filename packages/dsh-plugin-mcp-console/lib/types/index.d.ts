/**
 * Host-side types for @moon16u/dsh-plugin-mcp-console.
 * Hand-maintained alongside the hand-written lib/*.js (dsh-pouch convention).
 */
import type { Context, Fiber } from "@deepseek-ai/cordis";

/** serverName contract, mirrored from the official mcp-client. */
export type ServerScope = "global" | "project";

/** Console-stored stdio server config (own storage format). */
export interface StdioServerConfig {
  name: string;
  enabled: boolean;
  transport: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  scope: ServerScope;
  toolCallTimeoutMs: number;
  failOnStartupError: boolean;
  reconnect?: Record<string, unknown>;
  /** Official client's server-instruction byte cap, when configured. */
  maxInstructionBytes?: number;
  /** Disabled public tool names (per-tool switch, mcp-manager-gui-spec §3.4). */
  disabledTools: string[];
}

/** Console-stored streamable-http server config. */
export interface HttpServerConfig {
  name: string;
  enabled: boolean;
  transport: "streamable-http";
  url: string;
  headers: Record<string, string>;
  scope: ServerScope;
  toolCallTimeoutMs: number;
  failOnStartupError: boolean;
  reconnect?: Record<string, unknown>;
  /** Official client's server-instruction byte cap, when configured. */
  maxInstructionBytes?: number;
  /** Disabled public tool names (per-tool switch, mcp-manager-gui-spec §3.4). */
  disabledTools: string[];
}

export type ServerConfig = StdioServerConfig | HttpServerConfig;

/** One ledger entry: live assembly state for a managed server. */
export interface LedgerEntry {
  fiber: Fiber | null;
  config: ServerConfig | Partial<ServerConfig>;
  error: string | null;
  pending: boolean;
  loadedAt: number;
}

/** Machine-readable error codes mapped onto HTTP statuses. */
export type ConsoleErrorCode = "invalid" | "conflict" | "not_found" | "internal";

export declare class ConsoleError extends Error {
  code: ConsoleErrorCode;
  constructor(code: ConsoleErrorCode, message: string);
}

export declare class Orchestrator {
  constructor(ctx: Context, options: {
    globalStore: Store;
    onChange?: () => void;
    /** Profile patch layer this instance ingests (global instances only). */
    profileYamlPath?: string;
    /** Registration scope this instance's servers and guards belong to. */
    scopeKey?: string;
    /** Whether this instance ingests the profile patch layer. */
    ingestProfile?: boolean;
    /** Server names another live scope already owns. */
    reservedNames?: () => string[];
    /** Project-only instance: every stored server lives in the project store. */
    projectOnly?: boolean;
    /** Scope stored for servers this instance creates. */
    defaultScope?: ServerScope;
  });
  ledger: Map<string, LedgerEntry>;
  clientError: string | null;
  ingestError: string | null;
  profileYamlPath: string;
  projectStore: Store | null;
  projectRoot: string | null;
  bootstrap(): Promise<void>;
  reconcile(retry?: boolean): Promise<void>;
  close(): Promise<void>;
  add(server: Partial<ServerConfig>): Promise<{ config: Record<string, unknown> }>;
  update(name: string, patch: Record<string, unknown>): Promise<{ config: Record<string, unknown> }>;
  remove(name: string): Promise<{ removed: string }>;
  setEnabled(name: string, enabled: boolean): Promise<{ name: string; enabled: boolean }>;
  reconnect(name: string): Promise<{ name: string }>;
  probe(name: string, options?: { timeoutMs?: number }): Promise<{
    ok: boolean;
    live: boolean;
    toolCount: number;
    latencyMs: number | null;
    error: string | null;
  }>;
  refresh(): Promise<{
    restarted: string[];
    failed: { name: string; error: string | null }[];
    ingested: string[];
  }>;
  disabledToolSet: Set<string>;
  rebuildDisabledToolSet(): void;
  toolGuard(execution: { name?: string }): string | undefined;
  importServers(parsed: { name: string; config: Partial<ServerConfig> }[]): Promise<{
    added: Record<string, unknown>[];
    skipped: { name: string; reason: string }[];
  }>;
  storedServers(): Map<string, ServerConfig>;
  setProjectStore(store: Store | null, root: string | null): void;
  toolsOf(name: string, currentNames?: Set<string>): string[];
  attributeTools(name: string, current: Set<string>): string[];
  /** Ambiguity between this name and any other live/stored name, or null. */
  namespaceConflict(name: string): string | null;
  externalServerNames(): Set<string>;
  disposeExternalFiber(name: string): Promise<boolean>;
}

export declare class Store {
  constructor(filePath: string);
  path: string;
  lastError: string | null;
  read(): { version: number; servers: Record<string, Partial<ServerConfig>>; ui?: Record<string, unknown> };
  mutate(mutate: (servers: Record<string, Partial<ServerConfig>>) => unknown): unknown;
}

/** One tool as the panel sees it (mcp-manager-gui-spec §4 McpTool). */
export interface ToolView {
  /** Public tool name (mcp__<server>__<raw>, possibly hash-suffixed). */
  name: string;
  /** Display label: the public name without the server prefix. */
  label: string;
  enabled: boolean;
}

/** API snapshot (GET /servers payload shape). */
export interface ServerStatusView extends Record<string, unknown> {
  name: string;
  status: "running" | "connecting" | "loading" | "disabled" | "failed";
  toolCount: number;
  enabledToolCount: number;
  tools: ToolView[];
  disabledTools: string[];
  error: string | null;
  /** True when this server's namespace is ambiguous with another live name. */
  ambiguous: boolean;
}

export interface Snapshot {
  version: number;
  servers: ServerStatusView[];
  externalServers: {
    name: string;
    readOnly: true;
    status: string;
    toolCount: number;
    enabledToolCount: number;
    tools: ToolView[];
    error: string | null;
  }[];
  /** Whether the requesting session resolved to a project workspace store. */
  hasProjectWorkspace: boolean;
  projectWorkspaceRoot: string | null;
  storeErrors: string[];
  clientError: string | null;
}

export declare function computeSnapshot(orchestrator: Orchestrator): Snapshot;
export declare function parseMcpServers(text: string): {
  servers: { name: string; config: Partial<ServerConfig> }[];
  errors: string[];
};
export declare function validateServerConfig(server: unknown): { config?: ServerConfig; error?: string };
export declare function toClientConfig(server: ServerConfig): Record<string, unknown>;
export declare function mergeMasked(
  stored: Record<string, string> | undefined,
  incoming: Record<string, string> | undefined,
): Record<string, string>;
export declare function ingestProfileMcpEntries(options: { store: Store; yamlPath?: string }): Promise<{
  ingested: string[];
  skipped: { name: string; reason: string }[];
  cleanedYaml: boolean;
}>;
export declare function exportStoreToProfileYaml(options: { store: Store; yamlPath?: string }): Promise<{
  exported: string[];
  filePath: string;
  warnings: string[];
}>;
export declare function formatMcpYamlEntry(name: string, config: Partial<ServerConfig>): string;
export declare function defaultProfilePatchYamlPath(dshHome?: string, profile?: string): string;
export declare const name: string;
export declare function apply(ctx: Context, config?: unknown): void;
