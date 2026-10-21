import z from "@deepseek-ai/schemastery";
import { mountCommandHooks } from "./hooks/index.js";

export const name = "dsh-hooks";
export const entryId = "dsh-hooks";

// File-managed emergency gate and profile declarations. No editable UI schema.
export const Config = z.object({
  commandHooksEnabled: z.boolean().description("Permit trusted hooks; false disables every command").default(true),
  commandHooks: z.string().description("File-managed version-1 hook document")
    .default('{"version":1,"hooks":{}}'),
});

export function apply(ctx, config) {
  mountCommandHooks(ctx, config);
}
