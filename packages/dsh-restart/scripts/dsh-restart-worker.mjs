import { readFileSync } from "node:fs";
import { runNativeRestart, validateNativePlan } from "../lib/native-worker.js";

if (process.argv[2] === "--retry") {
  const failure = JSON.parse(readFileSync(process.argv[3], "utf8"));
  await runNativeRestart(validateNativePlan(failure.nativePlan));
} else {
  let plan;
  let committed = false;
  // Losing the caller before commitment is cancellation, not permission to
  // restart. Once committed, this detached worker survives the caller's exit.
  process.on("disconnect", () => { if (!committed) process.exit(0); });
  process.on("message", async (message) => {
    if (message?.type === "prepare" && !plan) {
      plan = validateNativePlan(message.plan);
      process.send({ type: "ready", id: plan.id });
    } else if (message?.type === "restart" && plan && message.id === plan.id && !committed) {
      committed = true;
      if (process.connected) process.disconnect();
      await runNativeRestart(plan);
    }
  });
}
