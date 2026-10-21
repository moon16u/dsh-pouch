import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The failure branch (`serve_error_page_and_fail`) is the only code that makes a
// failed restart visible, and it has no other coverage: the rest of the suite
// exercises registration and copy only. A `set -e` abort inside it exits before
// the marker is written, which silently disables the whole error page + notice
// chain — so the branch is executed here for real, with node stubbed out.

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "scripts", "dsh-restart.sh");

/**
 * Extract the one function under test from the shipped script.
 * Heredoc bodies are skipped while looking for the closing brace: the JSON
 * template this function writes has a bare `}` line of its own.
 */
function failureFunction() {
  const lines = readFileSync(script, "utf8").split("\n");
  const start = lines.findIndex((line) => line.startsWith("serve_error_page_and_fail() {"));
  assert.notEqual(start, -1, "serve_error_page_and_fail must exist in dsh-restart.sh");
  let heredoc = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (heredoc) {
      if (line === "EOF") heredoc = false;
      continue;
    }
    if (/<<-?'?EOF'?$/.test(line)) {
      heredoc = true;
      continue;
    }
    if (line === "}") return lines.slice(start, i + 1).join("\n");
  }
  assert.fail("serve_error_page_and_fail must be a complete function");
}

/** Run the branch in a throwaway home; the port is closed so the probe cannot pass. */
function runFailureBranch(home) {
  const runner = join(home, "run.sh");
  writeFileSync(runner, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'MODE=prod',
    'PORT_ARG=""',
    // Port 1 is never served: the "already answering" guard must not short-circuit.
    "PORT=1",
    `PROFILE_HOME=${JSON.stringify(home)}`,
    "NODE_BIN=/bin/false",
    failureFunction(),
    'serve_error_page_and_fail "test failure"',
    "",
  ].join("\n"));
  try {
    execFileSync("/bin/bash", [runner], { stdio: "pipe" });
    return 0;
  } catch (error) {
    return error.status ?? -1;
  }
}

test("first failure writes the marker and starts the fallback (no set -e abort)", () => {
  const home = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "dsh-restart-fail-"));
  try {
    const status = runFailureBranch(home);
    // The stub node cannot serve the page, so the branch ends with exit 1 —
    // never 2 (an unhandled `set -e` abort) and never 0.
    assert.equal(status, 1);
    const marker = JSON.parse(readFileSync(join(home, "restart-failed.json"), "utf8"));
    assert.equal(marker.reason, "test failure");
    assert.equal(marker.retryCount, 0);
    assert.equal(marker.lastRetryAt, "");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a repeated failure preserves the retry counter and the last retry time", () => {
  const home = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "dsh-restart-fail-"));
  try {
    writeFileSync(join(home, "restart-failed.json"), JSON.stringify({
      retryCount: 4,
      lastRetryAt: "2026-10-18T01:00:00",
    }));
    const status = runFailureBranch(home);
    assert.equal(status, 1);
    const marker = JSON.parse(readFileSync(join(home, "restart-failed.json"), "utf8"));
    assert.equal(marker.retryCount, 4);
    assert.equal(marker.lastRetryAt, "2026-10-18T01:00:00");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
