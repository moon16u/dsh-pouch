import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { packedFixture, packageRoot } from "./package-fixture.mjs";

async function waitFor(path, predicate = () => true) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (existsSync(path) && predicate(readFileSync(path, "utf8"))) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`isolated shell restart did not produce ${path}`);
}

test("packed shell restart supports legacy execution and current 0644 Bash execution", { timeout: 25000 }, async (t) => {
  const fixture = packedFixture();
  const keys = ["HOME", "PATH", "DSH_HOME", "DSH_BIN", "DSH_SHELL", "DSH_RESTART_DRY_RUN", "DSH_RESTART_DETACHED"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const disposers = [];
  t.after(() => {
    for (const dispose of disposers) dispose();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fixture.cleanup();
  });

  const bin = join(fixture.dir, "bin");
  mkdirSync(bin);
  // The real worker can only discover our fake process and receive fake
  // readiness responses. It cannot enumerate/kill a live DSH or contact HTTP.
  for (const [name, body] of Object.entries({
    pgrep: 'printf "process discovery blocked\\n" >> "$DSH_HOME/isolation.log"\nexit 1',
    systemctl: 'printf "service operation blocked\\n" >> "$DSH_HOME/isolation.log"\nexit 1',
    curl: 'printf "readiness stub; no network request\\n" >> "$DSH_HOME/isolation.log"\nexit 0',
    dsh: 'printf "%s\\n" "$@" > "$DSH_HOME/fake-dsh-argv"\n/bin/sleep 1\nprintf "exited\\n" > "$DSH_HOME/fake-dsh-exited"',
  })) {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  }
  symlinkSync(join(packageRoot, "node_modules"), join(fixture.pkg, "node_modules"), "dir");
  process.env.HOME = fixture.dir;
  process.env.PATH = `${bin}:/usr/bin:/bin`;
  process.env.DSH_BIN = join(bin, "dsh");
  delete process.env.DSH_SHELL;
  delete process.env.DSH_RESTART_DRY_RUN;
  delete process.env.DSH_RESTART_DETACHED;
  const script = join(fixture.pkg, "scripts", "dsh-restart.sh");

  const homeFor = (name) => {
    const home = join(fixture.dir, name);
    mkdirSync(join(home, "profiles", "web"), { recursive: true });
    process.env.DSH_HOME = home;
    return home;
  };
  const assertRestarted = async (home) => {
    await waitFor(join(home, "dsh-restart.log"), (text) => text.includes("DSH is up"));
    await waitFor(join(home, "fake-dsh-exited"));
    assert.equal(readFileSync(join(home, "fake-dsh-argv"), "utf8"), "--profile\nweb\n--no-open\n");
    const isolation = readFileSync(join(home, "isolation.log"), "utf8");
    assert.match(isolation, /process discovery blocked/);
    assert.match(isolation, /no network request/);
  };
  const legacyCall = (home) => execFileSync("/bin/bash", [
    "-c", 'exec "$1" --profile-home "$2"', "legacy-helper", script, home,
  ], { env: { ...process.env, DSH_RESTART_ALLOWED: "1" }, stdio: "pipe" });

  await t.test("the shipped 0755 script runs through a retained legacy direct-exec caller", async () => {
    const home = homeFor("legacy");
    legacyCall(home);
    await assertRestarted(home);
  });

  chmodSync(script, 0o644);
  await t.test("the original direct-exec failure is reproduced when the executable bit is lost", () => {
    const home = homeFor("legacy-without-exec");
    assert.throws(() => legacyCall(home), (error) => {
      assert.equal(error.status, 126);
      assert.match(String(error.stderr), /Permission denied/);
      return true;
    });
    assert.equal(existsSync(join(home, "fake-dsh-argv")), false);
  });

  await t.test("the current handler still runs the real 0644 script through Bash", async () => {
    const home = homeFor("current");
    const commands = [];
    const { apply } = await import(pathToFileURL(join(fixture.pkg, "lib", "index.js")));
    apply({
      commands: { register: (command) => commands.push(command) },
      tools: { register() {} },
      effect: (fn) => { disposers.push(fn()); },
    });
    const result = await commands.find((command) => command.name === "restart").handler({});
    assert.equal(result.kind, "success");
    await assertRestarted(home);
    await waitFor(join(home, "dsh-restart.schedule.status"), (text) => / 0\n$/.test(text));
  });
});
