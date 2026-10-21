import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("./", import.meta.url));
const linuxOnly = new Set(["failure-path.test.mjs", "packaging.test.mjs", "scheduling-failure.test.mjs", "smoke.test.mjs"]);
const files = readdirSync(directory).filter((file) => file.endsWith(".test.mjs")
  && (process.platform === "linux" || !linuxOnly.has(file))).sort();
const result = spawnSync(process.execPath, ["--test", ...files], { cwd: directory, stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
