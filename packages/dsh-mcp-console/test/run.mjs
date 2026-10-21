import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(tmpdir(), "_tmp_mcp-suite-"));
const fixtures = join(root, "fixtures");
mkdirSync(fixtures);
const env = { ...process.env, DSH_HOME: join(root, "home"), TMPDIR: fixtures, TMP: fixtures, TEMP: fixtures };
delete env.NODE_TEST_CONTEXT;

try {
  for (const file of readdirSync(here).filter(name => name.endsWith(".test.mjs")).sort()) {
    console.log(`\n--- ${file} (${process.platform}) ---`);
    const result = spawnSync(process.execPath, [join(here, file)], {
      cwd: join(here, ".."),
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  // Keep failed as well as successful fixtures recoverable outside the repo.
  renameSync(root, `${root}.recovered`);
  console.log(`Fixtures preserved: ${root}.recovered`);
}
