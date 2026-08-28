/**
 * Browser-side types for @moon16u/dsh-plugin-mcp-console (client bundle).
 */
import type * as React from "react";

/** Props injected into the settings section component. */
export interface McpSectionProps {
  /** Locale-bound translator provided by the section registration. */
  t: (key: string) => string;
}

/** The "MCP" settings section (mcp-manager-gui-spec.md). */
export declare const McpSection: React.FC<McpSectionProps>;
export declare function mcpConsoleApply(ctx: unknown): void;
export declare const mcpInject: string[];
