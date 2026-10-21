import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function cleanFixture(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) cleanFixture(path);
    else unlinkSync(path);
  }
  rmdirSync(dir);
}

test("restart shell script ships next to the module and parses with bash", () => {
  const script = join(root, "scripts", "dsh-restart.sh");
  assert.equal(statSync(script).isFile(), true);
  execFileSync("/bin/bash", ["-n", script]);
});

test("error page server ships next to the module", () => {
  const server = join(root, "scripts", "dsh-restart-error-server.js");
  assert.equal(statSync(server).isFile(), true);
});

test("commands and tool launch a readable 0644 script without an executable bit", async () => {
  const fixture = mkdtempSync(join(tmpdir(), "_tmp_dsh-restart-permissions-"));
  const oldHome = process.env.DSH_HOME;
  const oldDryRun = process.env.DSH_RESTART_DRY_RUN;
  try {
    const pkg = join(fixture, "installed package");
    const home = join(fixture, "instance home");
    mkdirSync(join(pkg, "lib"), { recursive: true });
    mkdirSync(join(pkg, "scripts"));
    cpSync(join(root, "lib", "index.js"), join(pkg, "lib", "index.js"));
    writeFileSync(join(pkg, "package.json"), '{"type":"module"}\n');
    symlinkSync(join(root, "node_modules"), join(pkg, "node_modules"), "dir");

    // Never run the real restart worker: this inert stand-in only records argv.
    const script = join(pkg, "scripts", "dsh-restart.sh");
    writeFileSync(script, '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$DSH_HOME/received-args"\n');
    chmodSync(script, 0o644);
    process.env.DSH_HOME = home;
    process.env.DSH_RESTART_DRY_RUN = "1";
    const commands = [];
    let tool;
    const { apply } = await import(pathToFileURL(join(pkg, "lib", "index.js")).href);
    apply({
      commands: { register: (command) => commands.push(command) },
      tools: { register: (def) => { tool = def; } },
    });
    assert.deepEqual(commands.map(({ name }) => name), ["restart", "dsh-restart"]);
    assert.equal(tool.name, "dsh_restart");

    for (const invoke of [
      ...commands.map((command) => () => command.handler({ rawInput: "" })),
      () => tool.execute({}, {}),
    ]) {
      const result = await invoke();
      assert.match(result.text, /scheduled in 3s/);
      const helperPath = join(home, "dsh-restart-helper.sh");
      const helper = readFileSync(helperPath, "utf8");
      assert.match(helper, /^sleep 3$/m);
      // Keep the generated exec line intact; remove only the grace-period wait.
      writeFileSync(helperPath, helper.replace(/^sleep 3$/m, "sleep 0"));
      execFileSync("/bin/bash", [helperPath], {
        env: { ...process.env, DSH_RESTART_ALLOWED: "1" },
        timeout: 5000,
        stdio: "pipe",
      });
      assert.equal(readFileSync(join(home, "received-args"), "utf8"), `--profile-home\n${home}\n`);
      unlinkSync(join(home, "received-args"));
      assert.equal(statSync(script).mode & 0o777, 0o644, "must not chmod installed files");
    }
  } finally {
    if (oldHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = oldHome;
    if (oldDryRun === undefined) delete process.env.DSH_RESTART_DRY_RUN;
    else process.env.DSH_RESTART_DRY_RUN = oldDryRun;
    cleanFixture(fixture);
  }
});
