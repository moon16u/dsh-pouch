import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { HookStore } from "./store.js";
import { HookEngine } from "./engine.js";
import { registerAdapters } from "./adapters.js";
import { registerRoutes } from "./routes.js";
import { hash } from "./config.js";

const value = (field) => field && typeof field.get === "function" ? field.get() : field;

export function mountCommandHooks(ctx, config) {
  if (typeof ctx.inject !== "function" || process.env.DSH_HOOK_ACTIVE === "1") return;
  ctx.inject(["subprocess"], (scope) => {
    // No command engine is mounted until the host-owned ledger is readable.
    let engine;
    try {
      const home = resolve(process.env.DSH_HOME?.trim() || join(homedir(), ".dsh"));
      const profile = scope.get?.("profileContext")?.name ?? "default";
      // Keep the existing ledger location so renaming the plugin preserves approvals.
      const store = new HookStore(join(home, "workspace-hooks", `${hash(profile).slice(0, 16)}.json`));
      engine = new HookEngine({
        store, subprocess: scope.subprocess, home, profile, cwd: process.cwd(), logger: scope.logger,
        getConfig: () => ({
          commandHooksEnabled: value(config?.commandHooksEnabled),
          commandHooks: value(config?.commandHooks),
        }),
      });
      registerAdapters(scope, engine);
      scope.effect(() => () => engine.dispose());
      scope.inject(["connection"], (web) => registerRoutes(web, engine));
    } catch (error) {
      scope.logger?.warn?.(`dsh-hooks not mounted: ${error.message}`);
      if (engine) void engine.dispose();
    }
  });
}
