/**
 * Browser-side types for @moon16u/dsh-mcp-console (client bundle).
 */
import type * as React from "react";

/** Props injected into the MCP management component. */
export interface McpSectionProps {
  /** Locale-bound translator provided by the Plugins page registration. */
  t: (key: string) => string;
}

/** The server-management body embedded in the MCP Plugins page. */
export declare const McpSection: React.FC<McpSectionProps>;
export declare function mcpConsoleApply(ctx: unknown): void;
export declare const mcpInject: string[];
