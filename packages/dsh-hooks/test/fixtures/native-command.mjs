import fs from "node:fs";
import { spawn } from "node:child_process";

const [mode, ...args] = process.argv.slice(2);
if (mode === "heartbeat") {
  setInterval(() => fs.appendFileSync(args[0], "x"), 25);
} else if (mode === "wait") {
  const child = spawn(process.execPath, [process.argv[1], "heartbeat", "heartbeat"], { stdio: "ignore" });
  child.on("error", (error) => { throw error; });
  fs.writeFileSync("pids.json", JSON.stringify({ parent: process.pid, child: child.pid }));
  setInterval(() => {}, 1000);
} else {
  let stdin = "";
  for await (const chunk of process.stdin) stdin += chunk;
  const input = JSON.parse(stdin);
  if (mode === "echo") {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: input.hook_event_name, additionalContext: input.prompt,
    } }));
  } else if (mode === "text") {
    process.stdout.write("\u6708\u89c1 caf\u00e9 \ud83c\udf19");
  } else if (mode === "overflow") {
    process.stdout.write("x".repeat(5000));
  } else if (mode === "env") {
    process.stdout.write(JSON.stringify({
      secret: process.env.DSH_HOOK_TEST_SECRET ?? "unset",
      startup: process.env.BASH_ENV ?? "unset",
      options: process.env.NODE_OPTIONS ?? "unset",
      explicit: process.env.HOOK_VALUE ?? "unset",
      active: process.env.DSH_HOOK_ACTIVE,
      event: process.env.DSH_HOOK_EVENT,
      cwd: process.cwd(),
    }));
  } else if (mode === "counter") {
    fs.appendFileSync("counter", "x");
    process.stdout.write("context");
  } else if (mode === "exit") {
    process.stderr.write("exit reason");
    process.exitCode = Number(args[0]);
  } else {
    throw new Error(`Unknown fixture mode: ${mode}`);
  }
}
