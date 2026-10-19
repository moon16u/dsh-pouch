import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "dsh-restart";
export const inject = ["commands", "tools"];

// Fixed restart delay: the user wants every restart to happen 3 seconds after
// the request. Even if a model passes delay_ms (e.g. 15000), it is ignored and
// replaced with this constant.
const FIXED_DELAY_MS = 3000;
const SCRIPT = join(fileURLToPath(new URL("../scripts/", import.meta.url)), "dsh-restart.sh");
// Written by dsh-restart.sh's failure branches; removed by its success path.
const FAILURE_MARKER = "restart-failed.json";
// Stop surfacing a failure notice after this long — the marker may survive if
// the user never restarts successfully again, and an ancient failure is noise.
const FAILURE_NOTICE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function currentDshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function stripTrailingSlash(path) {
  return path.length > 1 && path.endsWith("/") ? path.replace(/\/+$/, "") : path;
}

/**
 * Build the script arguments naming the instance to restart.
 *
 * The script has its own defaults (`~/.dsh`, or `~/.dsh-dev` for `dev`), and
 * those defaults are wrong for any instance running on another home. The mode
 * word is only kept where it still adds something: `dev` also selects the dev
 * port, since the dev instance is identified by its home, not by a flag.
 */
function restartTargetArgs(dshHome) {
  const home = stripTrailingSlash(dshHome);
  const devHome = join(homedir(), ".dsh-dev");
  if (home === devHome) return ["dev", "--profile-home", home];
  return ["--profile-home", home];
}

function scheduleDetachedRestart(delayMs = FIXED_DELAY_MS) {
  const dshHome = currentDshHome();
  const args = restartTargetArgs(dshHome)
    .map((arg) => JSON.stringify(arg))
    .join(" ");
  const helper = `#!/usr/bin/env bash
# Detached restart helper written by @deepseek-ai/dsh-restart.
# The outer DSH process may exit while this helper sleeps; once it is
# reparented to init the sleep below still continues. The restart script is
# invoked with DSH_RESTART_ALLOWED=1 through bash so installed packages do not
# need to preserve its executable bit.
sleep ${Math.max(0, Number(delayMs) || 0) / 1000}
exec /bin/bash ${JSON.stringify(SCRIPT)} ${args} >> ${JSON.stringify(join(dshHome, "dsh-restart.schedule.log"))} 2>&1
`;
  const helperPath = join(dshHome, "dsh-restart-helper.sh");
  mkdirSync(dshHome, { recursive: true });
  writeFileSync(helperPath, helper, { mode: 0o700 });
  // Test/ops safety valve: with DSH_RESTART_DRY_RUN=1 the helper file is
  // written but never spawned. The smoke tests set this — their handler
  // invocations would otherwise schedule a REAL detached restart of whatever
  // DSH_HOME instance the test process inherited (this actually restarted
  // production once; see smoke.test.mjs).
  if (process.env.DSH_RESTART_DRY_RUN === "1") {
    return helperPath;
  }
  // Launch the helper through setsid+nohup so it is reparented to init
  // immediately and survives the DSH process being killed. A plain
  // spawn(detached) does not reparent while the parent DSH process is still
  // alive, so the helper would remain a child of DSH and die with it.
  const launch = `nohup setsid env DSH_RESTART_ALLOWED=1 DSH_HOME=${JSON.stringify(dshHome)} bash ${JSON.stringify(helperPath)} >>${JSON.stringify(join(dshHome, "dsh-restart-helper.log"))} 2>&1 < /dev/null &`;
  execFileSync("/bin/bash", ["-c", launch], { stdio: "ignore" });
  return helperPath;
}

// Failure-visibility notice: dsh-restart.sh writes restart-failed.json when a
// restart fails (the browser then sees the error page served by
// dsh-restart-error-server.js), and removes it on the next successful start.
// While the marker exists, surface it as a dynamic prompt section so the model
// tells the user about the failure at the start of the next conversation —
// this covers the "user fixed it manually, DSH came up much later" gap where
// nobody ever looked at the browser again. Returns "" (contributes nothing)
// whenever the marker is absent or stale; must never throw into assembly.
function failureNoticeSection() {
  return {
    name: "dsh-restart:failure-notice",
    order: 190,
    text: () => {
      try {
        const path = join(currentDshHome(), FAILURE_MARKER);
        if (Date.now() - statSync(path).mtimeMs > FAILURE_NOTICE_MAX_AGE_MS) return "";
        const m = JSON.parse(readFileSync(path, "utf8"));
        const retries = Number(m.retryCount) || 0;
        return [
          "系统提示：上一次 DSH 自动重启曾失败，且此后还没有一次成功的重启将其清除。",
          `失败时间 ${m.time ?? "未知"}；原因：${m.reason ?? "未知"}；报错页上的“重新启动”按钮已被按下 ${retries} 次。`,
          "请在回复的开头用一句话告知用户此事（例如提醒其浏览器里可能还开着报错页）。",
          `细节可查看 ${join(currentDshHome(), "dsh-restart-error-server.log")} 与同目录的 ${FAILURE_MARKER}；一次成功的重启会自动删除该标记。`,
        ].join("\n");
      } catch {
        return "";
      }
    },
  };
}

export function apply(ctx) {
  // The notice is optional — a runtime without a prompt registry still gets
  // the commands and the tool. It must be registered through ctx.inject rather
  // than read with ctx.get at apply time: row order carries no load semantics,
  // so when the system-prompt row activates after this one, ctx.get returns
  // undefined and the section would be dropped for the whole process.
  if (typeof ctx.inject === "function") {
    ctx.inject(["systemPrompt"], (scope) => {
      const systemPrompt = scope.get ? scope.get("systemPrompt") : scope.systemPrompt;
      if (systemPrompt) systemPrompt.section(failureNoticeSection());
    });
  } else {
    try {
      const systemPrompt = ctx.get ? ctx.get("systemPrompt") : undefined;
      if (systemPrompt) systemPrompt.section(failureNoticeSection());
    } catch {
      // Test doubles and exotic runtimes: the notice is best-effort.
    }
  }

  const restartHandler = async () => {
    const helperPath = scheduleDetachedRestart(FIXED_DELAY_MS);
    return {
      kind: "success",
      text: `DSH restart scheduled in ${FIXED_DELAY_MS / 1000}s. Helper: ${helperPath}`,
    };
  };

  ctx.commands.register({
    name: "restart",
    description: "在 3 秒后平滑重启 DSH 进程",
    handler: restartHandler,
  });

  ctx.commands.register({
    name: "dsh-restart",
    description: "在 3 秒后平滑重启 DSH 进程",
    handler: restartHandler,
  });

  ctx.tools.register(defineTool({
    name: "dsh_restart",
    description: "Schedule a DSH restart in exactly 3 seconds. Returns immediately; DSH will restart automatically and the conversation will resume after reload. Use this when the user asks to restart DSH/current process. This tool has no parameters; the delay is fixed at 3000ms (3s) and cannot be changed.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true },
          text: { type: "string", required: true },
        },
      },
      render: (args, value) => [{ type: "text", text: value.text }],
    },
    execute: () => {
      const helperPath = scheduleDetachedRestart(FIXED_DELAY_MS);
      return Promise.resolve({
        ok: true,
        text: `DSH restart scheduled in ${FIXED_DELAY_MS / 1000}s. Helper: ${helperPath}`,
      });
    },
  }));
}
