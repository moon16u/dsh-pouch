import * as currentTime from "../packages/dsh-plugin-current-time/lib/index.js";
import * as llmHeaders from "../packages/dsh-plugin-llm-headers/lib/index.js";
import * as llmModelListing from "../packages/dsh-plugin-llm-model-listing/lib/index.js";
import * as mcpConsole from "../packages/dsh-plugin-mcp-console/lib/index.js";
import * as restart from "../packages/dsh-plugin-restart/lib/index.js";
import * as sessionId from "../packages/dsh-plugin-session-id/lib/index.js";
import * as tavily from "../packages/dsh-plugin-web-search-tavily/lib/index.js";

export function apply(ctx, config) {
  ctx.plugin(sessionId);
  ctx.plugin(currentTime);
  ctx.plugin(restart);
  ctx.plugin(tavily, config);
  // No config forwarded: this one reads its own `llm-headers` settings section,
  // so it stays dormant until that section declares a route.
  ctx.plugin(llmHeaders);
  // Same shape: dormant until `llm-model-listing.rules` names a listing URL.
  ctx.plugin(llmModelListing);
  // MCP console: manages the official dsh-mcp-client at runtime; activates
  // its webServer/tools machinery only on hosts that carry both services.
  ctx.plugin(mcpConsole);
}

export * from "../packages/dsh-plugin-web-search-tavily/lib/index.js";
