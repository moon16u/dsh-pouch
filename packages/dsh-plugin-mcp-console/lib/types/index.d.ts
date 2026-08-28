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
  /** Disabled public tool names (per-tool switch, mcp-manager-gui-spec §3.4). */
  disabledTools: string[];
}

export type ServerConfig = StdioServerConfig | HttpServerConfig;

/** One ledger entry: live assembly state for a managed server. */
export interface LedgerEntry {
  fiber: Fiber | null;
  config: ServerConfig;
  toolNames: Set<string>;
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
  constructor(ctx: Context, options: { globalStore: Store; onChange?: () => void });
  ledger: Map<string, LedgerEntry>;
  profileDeclared: Set<string>;
  bootstrap(): Promise<void>;
  add(server: Partial<ServerConfig>): Promise<{ config: Record<string, unknown> }>;
  update(name: string, patch: Record<string, unknown>): Promise<{ config: Record<string, unknown> }>;
  remove(name: string): Promise<{ removed: string }>;
  setEnabled(name: string, enabled: boolean): Promise<{ name: string; enabled: boolean }>;
  reconnect(name: string): Promise<{ name: string }>;
  refresh(): Promise<{ restarted: string[] }>;
  disabledToolSet: Set<string>;
  rebuildDisabledToolSet(): void;
  toolGuard(execution: { name?: string }): string | undefined;
  importServers(parsed: { name: string; config: Partial<ServerConfig> }[]): Promise<{
    added: Record<string, unknown>[];
    skipped: { name: string; reason: string }[];
  }>;
  storedServers(): Map<string, ServerConfig>;
  toolsOf(name: string): string[];
  externalServerNames(): Set<string>;
}

export declare class Store {
  constructor(filePath: string);
  path: string;
  lastError: string | null;
  read(): { version: number; servers: Record<string, Partial<ServerConfig>>; ui?: Record<string, unknown> };
  mutate(mutate: (servers: Record<string, Partial<ServerConfig>>) => unknown): unknown;
  writeUi(ui: Record<string, unknown>): Record<string, unknown>;
  read(): { version: number; servers: Record<string, Partial<ServerConfig>>; ui?: Record<string, unknown> };
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
}

export interface Snapshot {
  version: number;
  servers: ServerStatusView[];
  external: string[];
  storeErrors: string[];
  clientError: string | null;
}

export declare function computeSnapshot(orchestrator: Orchestrator): Snapshot;
export declare function parseMcpServers(text: string): {
  servers: { name: string; config: Partial<ServerConfig> }[];
  errors: string[];
};
export declare function validateServerConfig(server: unknown): { config?: ServerConfig; error?: string };
export declare function scanProfileMcpServerNames(dshHome?: string): Set<string>;
export declare const name: string;
export declare function apply(ctx: Context): void;
