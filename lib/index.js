import * as currentTime from "../packages/dsh-plugin-current-time/lib/index.js";
import * as mcpConsole from "../packages/dsh-plugin-mcp-console/lib/index.js";
import * as restart from "../packages/dsh-plugin-restart/lib/index.js";
import * as sessionCopy from "../packages/dsh-plugin-session-copy/lib/index.js";
import * as tavily from "../packages/dsh-plugin-web-search-tavily/lib/index.js";

export function apply(ctx, config) {
  ctx.plugin(sessionCopy);
  ctx.plugin(currentTime);
  ctx.plugin(restart);
  ctx.plugin(tavily, config);
  // MCP console: manages the official dsh-mcp-client at runtime; activates
  // its webServer/tools machinery only on hosts that carry both services.
  ctx.plugin(mcpConsole);
}
