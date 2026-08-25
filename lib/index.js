import * as currentTime from "../packages/dsh-plugin-current-time/lib/index.js";
import * as llmHeaders from "../packages/dsh-plugin-llm-headers/lib/index.js";
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
}

export * from "../packages/dsh-plugin-web-search-tavily/lib/index.js";
