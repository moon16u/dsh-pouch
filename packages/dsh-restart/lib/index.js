import { join } from "node:path";
import { homedir } from "node:os";
import { accessSync, constants, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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

function shellQuote(value) {
  return "'" + String(value).replaceAll("'", "'\\''") + "'";
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function logTail(path) {
  try {
    return readFileSync(path, "utf8").slice(-2000).trim();
  } catch {
    return "";
  }
}

function schedulingFailure(dshHome, attempt, reason, logPath, publish) {
  const failure = {
    source: "schedule",
    attemptId: attempt.id,
    sessionId: attempt.sessionId,
    time: new Date().toISOString(),
    reason,
    logPath,
    retryCount: 0,
  };
  // Keep the live GUI notification even if the home becomes unwritable.
  publish(failure);
  writeFileSync(join(dshHome, FAILURE_MARKER), JSON.stringify(failure), { mode: 0o600 });
  return failure;
}

function scheduleDetachedRestart(delayMs = FIXED_DELAY_MS, sessionId, track = () => {}, publish = () => {}) {
  const dshHome = currentDshHome();
  const attempt = { id: randomUUID(), sessionId };
  const statusPath = join(dshHome, "dsh-restart.schedule.status");
  const scheduleLog = join(dshHome, "dsh-restart.schedule.log");
  const helperLog = join(dshHome, "dsh-restart-helper.log");
  const args = restartTargetArgs(dshHome)
    .map(shellQuote)
    .join(" ");
  accessSync(SCRIPT, constants.R_OK);
  execFileSync("/bin/bash", ["-n", SCRIPT], { stdio: "pipe" });
  const helper = `#!/usr/bin/env bash
# Detached restart helper written by @moon16u/dsh-restart.
# Record the launcher result even when bash cannot open the installed script.
set -e
report_exit() {
  code=$?
  printf '%s %s\\n' ${shellQuote(attempt.id)} "$code" > ${shellQuote(statusPath)}
}
trap report_exit EXIT
printf '%s running\\n' ${shellQuote(attempt.id)} > ${shellQuote(statusPath)}
sleep ${Math.max(0, Number(delayMs) || 0) / 1000}
/bin/bash ${shellQuote(SCRIPT)} ${args} >> ${shellQuote(scheduleLog)} 2>&1
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
  writeFileSync(scheduleLog, "", { mode: 0o600 });
  writeFileSync(helperLog, "", { mode: 0o600 });
  // Launch the helper through setsid+nohup so it is reparented to init
  // immediately and survives the DSH process being killed. A plain
  // spawn(detached) does not reparent while the parent DSH process is still
  // alive, so the helper would remain a child of DSH and die with it.
  const launch = `for dependency in nohup setsid env sleep; do
  command -v "$dependency" >/dev/null || { printf 'Missing restart dependency: %s\\n' "$dependency" >&2; exit 127; }
done
nohup setsid env DSH_RESTART_ALLOWED=1 DSH_HOME=${shellQuote(dshHome)} /bin/bash ${shellQuote(helperPath)} >>${shellQuote(helperLog)} 2>&1 < /dev/null &`;
  execFileSync("/bin/bash", ["-c", launch], { stdio: "pipe" });
  const deadline = Date.now() + delayMs + 5000;
  const timer = setInterval(() => {
    try {
      const status = logTail(statusPath).split(" ");
      if (status[0] === attempt.id && status[1] === "0") {
        stop();
        return;
      }
      const failed = status[0] === attempt.id && /^\d+$/.test(status[1]);
      if (!failed && Date.now() < deadline) return;
      stop();
      const logPath = failed && logTail(scheduleLog) ? scheduleLog : helperLog;
      const detail = logTail(logPath);
      const reason = failed
        ? `Restart launcher exited with code ${status[1]}.`
        : "Restart helper did not report completion before the deadline.";
      schedulingFailure(dshHome, attempt, detail ? `${reason}\n${detail}` : reason, logPath, publish);
    } catch (error) {
      stop();
      console.error("[dsh-restart] cannot record scheduling failure:", error);
    }
  }, 100);
  const stop = () => {
    clearInterval(timer);
    untrack?.();
  };
  const untrack = track(stop);
  timer.unref();
  return helperPath;
}

function readFailure(liveFailure) {
  const latest = liveFailure();
  if (latest && Date.now() - Date.parse(latest.time) <= FAILURE_NOTICE_MAX_AGE_MS) return latest;
  const path = join(currentDshHome(), FAILURE_MARKER);
  if (Date.now() - statSync(path).mtimeMs > FAILURE_NOTICE_MAX_AGE_MS) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function registerFailureStatus(ctx, liveFailure) {
  ctx.inject(["connection"], (scope) => {
    const connection = scope.get ? scope.get("connection") : scope.connection;
    if (typeof connection?.fetch?.register !== "function") return;
    // connection.fetch authenticates requests; a raw webServer route would not.
    const dispose = connection.fetch.register({
      path: "/api/dsh-restart/status",
      methods: ["GET"],
      requestBody: "buffered",
      fetch() {
        let failure = null;
        try {
          const marker = readFailure(liveFailure);
          if (marker?.source === "schedule") failure = marker;
        } catch {
          // No marker, a partial write, or an unavailable home means no notice.
        }
        return new Response(JSON.stringify({ failure }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    });
    if (typeof scope.effect === "function") scope.effect(() => dispose);
  });
}

// Failure-visibility notice: dsh-restart.sh writes restart-failed.json when a
// restart fails (the browser then sees the error page served by
// dsh-restart-error-server.js), and removes it on the next successful start.
// While the marker exists, surface it as a dynamic prompt section so the model
// tells the user about the failure at the start of the next conversation —
// this covers the "user fixed it manually, DSH came up much later" gap where
// nobody ever looked at the browser again. Returns "" (contributes nothing)
// whenever the marker is absent or stale; must never throw into assembly.
function failureNoticeSection(liveFailure) {
  return {
    name: "dsh-restart:failure-notice",
    order: 190,
    text: () => {
      try {
        const m = readFailure(liveFailure);
        if (!m) return "";
        if (m.source === "schedule") {
          return [
            "系统提示：上一次 DSH 重启调度失败。请在回复开头用一句话告知用户。",
            `失败时间 ${m.time ?? "未知"}；原因：${m.reason ?? "未知"}。`,
            `日志：${m.logPath ?? join(currentDshHome(), "dsh-restart.schedule.log")}。`,
          ].join("\n");
        }
        const retries = Number(m.retryCount) || 0;
        return [
          "系统提示：上一次 DSH 自动重启曾失败，且此后还没有一次成功的重启将其清除。",
          `失败时间 ${m.time ?? "未知"}；原因：${m.reason ?? "未知"}；报错页上的“重新启动”按钮已被按下 ${retries} 次。`,
          "请在回复的开头用一句话告知用户此事（例如提醒其浏览器里可能还开着报错页）。",
          `细节可查看 ${m.logPath ?? join(currentDshHome(), "dsh-restart-error-server.log")} 与同目录的 ${FAILURE_MARKER}；一次成功的重启会自动删除该标记。`,
        ].join("\n");
      } catch {
        return "";
      }
    },
  };
}

export function apply(ctx) {
  if (ctx.get?.("profileContext")?.name === "desktop") {
    throw new Error("dsh-restart is Web-only. DeepSeek Harness Desktop on Windows/macOS is not supported; quit and reopen the desktop application.");
  }
  const monitors = new Set();
  let scheduling = false;
  let latestFailure = null;
  const liveFailure = () => latestFailure;
  if (typeof ctx.effect === "function") {
    ctx.effect(() => () => {
      for (const stop of monitors) stop();
      monitors.clear();
    });
  }
  // The notice is optional — a runtime without a prompt registry still gets
  // the commands and the tool. It must be registered through ctx.inject rather
  // than read with ctx.get at apply time: row order carries no load semantics,
  // so when the system-prompt row activates after this one, ctx.get returns
  // undefined and the section would be dropped for the whole process.
  if (typeof ctx.inject === "function") {
    registerFailureStatus(ctx, liveFailure);
    ctx.inject(["systemPrompt"], (scope) => {
      const systemPrompt = scope.get ? scope.get("systemPrompt") : scope.systemPrompt;
      if (systemPrompt) systemPrompt.section(failureNoticeSection(liveFailure));
    });
  } else {
    try {
      const systemPrompt = ctx.get ? ctx.get("systemPrompt") : undefined;
      if (systemPrompt) systemPrompt.section(failureNoticeSection(liveFailure));
    } catch {
      // Test doubles and exotic runtimes: the notice is best-effort.
    }
  }

  async function schedule(agent) {
    if (monitors.size || scheduling) return { ok: false, text: "A DSH restart is already scheduled; wait for its launcher to finish." };
    scheduling = true;
    try {
      const track = (stop) => {
        monitors.add(stop);
        return () => monitors.delete(stop);
      };
      const publish = (failure) => { latestFailure = failure; };
      let helperPath;
      if (process.platform === "win32" || process.platform === "darwin") {
        const { scheduleNativeRestart } = await import("./native-restart.js");
        helperPath = await scheduleNativeRestart(ctx, currentDshHome(), agent?.session?.id, FIXED_DELAY_MS, track, publish);
      } else {
        helperPath = scheduleDetachedRestart(FIXED_DELAY_MS, agent?.session?.id, track, publish);
      }
      return { ok: true, text: `DSH restart scheduled in ${FIXED_DELAY_MS / 1000}s. Helper: ${helperPath}` };
    } catch (error) {
      return {
        ok: false,
        text: `Failed to schedule DSH restart: ${errorText(error)}. Logs: ${join(currentDshHome(), "dsh-restart-helper.log")} and ${join(currentDshHome(), "dsh-restart.schedule.log")}`,
      };
    } finally {
      scheduling = false;
    }
  }
  const restartHandler = async (invocation) => {
    const result = await schedule(invocation?.agent);
    return { kind: result.ok ? "success" : "error", text: result.text };
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
    execute: (_args, exec) => Promise.resolve(schedule(exec?.agent)),
  }));
}
