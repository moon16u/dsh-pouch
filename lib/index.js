import * as currentTime from "../packages/dsh-plugin-current-time/lib/index.js";
import * as llmHeaders from "../packages/dsh-plugin-llm-headers/lib/index.js";
import * as mcpConsole from "../packages/dsh-plugin-mcp-console/lib/index.js";
import * as restart from "../packages/dsh-plugin-restart/lib/index.js";
import * as sessionId from "../packages/dsh-plugin-session-id/lib/index.js";
import * as tavily from "../packages/dsh-plugin-web-search-tavily/lib/index.js";

// llm-model-listing is a local-only package: it targets one vendor's endpoint,
// carries `private: true`, and root `files` keeps it out of the published
// tarball. So it is present in a checkout and absent from an installed copy,
// and a static import would turn every install into ERR_MODULE_NOT_FOUND.
// Top-level await is fine here — the cordis loader awaits this module's import.
let llmModelListing;
try {
  llmModelListing = await import("../packages/dsh-plugin-llm-model-listing/lib/index.js");
} catch {
  llmModelListing = undefined;
}

export function apply(ctx, config) {
  ctx.plugin(sessionId);
  ctx.plugin(currentTime);
  ctx.plugin(restart);
  ctx.plugin(tavily, config);
  // No config forwarded: this one reads its own `llm-headers` settings section,
  // so it stays dormant until that section declares a route.
  ctx.plugin(llmHeaders);
  // Same shape: dormant until `llm-model-listing.rules` names a listing URL.
  // Absent from an installed copy; see the guarded import above.
  if (llmModelListing !== undefined) ctx.plugin(llmModelListing);
  // MCP console: manages the official dsh-mcp-client at runtime; activates
  // its webServer/tools machinery only on hosts that carry both services.
  ctx.plugin(mcpConsole);
}

export * from "../packages/dsh-plugin-web-search-tavily/lib/index.js";
