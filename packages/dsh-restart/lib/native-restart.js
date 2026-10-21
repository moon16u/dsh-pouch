import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, closeSync, constants, mkdirSync, openSync } from "node:fs";
import { isAbsolute, join, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { isSea } from "node:sea";

export const NATIVE_WORKER = fileURLToPath(new URL("../scripts/dsh-restart-worker.mjs", import.meta.url));

// Match launch-environment's case-insensitive Windows keys. Never carry an
// old restart worker's markers into the replacement application.
export function nativeEnvironment(env, home, platform) {
  const result = {};
  for (const [key, value] of Object.entries(env)) {
    const name = platform === "win32" ? key.toUpperCase() : key;
    if (["DSH_HOME", "DSH_SHELL", "DSH_RESTART_ALLOWED", "DSH_RESTART_DETACHED"].includes(name)) continue;
    if (value !== undefined) result[key] = value;
  }
  result.DSH_HOME = home;
  return result;
}

export function nativeLaunchPlan(ctx, home, sessionId, runtime = process) {
  const profile = ctx.get?.("profileContext");
  const exit = ctx.get?.("appExit");
  if (typeof exit !== "function") throw new Error("Native restart requires the DSH launcher's appExit service.");
  if (!profile || profile.name === "desktop" || runtime.connected || runtime.versions?.electron) {
    throw new Error("Native restart supports CLI/Web hosts, not Electron/IPC-managed hosts. Restart those through their owner.");
  }
  if (runtime.versions?.bun || runtime.pkg || (runtime === process && isSea())) {
    throw new Error("Native restart requires a Node.js CLI host, not an embedded executable runtime.");
  }
  const server = ctx.get?.("webServer");
  if (!server || typeof server.getOrigin !== "function") throw new Error("Native restart requires a running Web server.");
  const origin = new URL(server.getOrigin());
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error("Invalid Web server origin for native restart.");
  }
  const path = runtime.platform === "win32" ? win32 : { isAbsolute };
  const entry = runtime.argv[1];
  if (!entry || !path.isAbsolute(entry) || !path.isAbsolute(runtime.execPath)) {
    throw new Error("Native restart requires absolute Node and CLI entry paths.");
  }
  const args = [...runtime.execArgv, ...runtime.argv.slice(1)];
  if (!args.includes("--no-open")) args.push("--no-open");
  return {
    plan: {
      id: randomUUID(),
      sessionId,
      ownerPid: runtime.pid,
      executable: runtime.execPath,
      args,
      cwd: profile.cwd || runtime.cwd(),
      home: profile.home || home,
      origin: origin.origin,
      platform: runtime.platform,
    },
    exit,
  };
}

export async function scheduleNativeRestart(ctx, home, sessionId, delayMs, track, publish, internals = {}) {
  const runtime = internals.runtime || process;
  const { plan, exit } = nativeLaunchPlan(ctx, home, sessionId, runtime);
  accessSync(NATIVE_WORKER, constants.R_OK);
  accessSync(plan.executable, constants.F_OK);
  if (runtime.env.DSH_RESTART_DRY_RUN === "1") return NATIVE_WORKER;
  mkdirSync(plan.home, { recursive: true });
  const logPath = join(plan.home, "dsh-restart-helper.log");
  const fd = openSync(logPath, "a", 0o600);
  let child;
  try {
    child = (internals.spawn || spawn)(plan.executable, [NATIVE_WORKER], {
      cwd: plan.cwd,
      env: nativeEnvironment(runtime.env, plan.home, runtime.platform),
      detached: true,
      windowsHide: true,
      stdio: ["ignore", fd, fd, "ipc"],
    });
  } finally {
    closeSync(fd);
  }
  let committed = false;
  let settled = false;
  let ready = false;
  let timer;
  let untrack;
  const cleanup = () => {
    clearTimeout(timer);
    if (!committed && child.connected) child.disconnect();
    child.unref();
    untrack?.();
  };
  return new Promise((resolve, reject) => {
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!ready) reject(error);
      else publish({
        source: "schedule", attemptId: plan.id, sessionId,
        time: new Date().toISOString(), reason: error.message, logPath, retryCount: 0,
      });
    };
    untrack = track(() => fail(new Error("Native restart was cancelled before handoff.")));
    timer = setTimeout(() => fail(new Error("Native restart helper did not become ready.")), 5000);
    child.once("error", fail);
    child.once("exit", (code, signal) => {
      if (!committed && !settled) {
        fail(new Error(`Native restart helper exited before handoff (${code ?? signal}).`));
      }
    });
    child.on("message", (message) => {
      if (settled || ready || message?.type !== "ready" || message.id !== plan.id) return;
      clearTimeout(timer);
      ready = true;
      // The 3-second grace begins only after a live helper acknowledged its plan.
      timer = setTimeout(() => {
        child.send({ type: "restart", id: plan.id }, (error) => {
          if (settled) return;
          if (error) { fail(error); return; }
          committed = true;
          settled = true;
          cleanup();
          try {
            exit(0);
          } catch (error) {
            publish({
              source: "schedule", attemptId: plan.id, sessionId,
              time: new Date().toISOString(), reason: `DSH appExit failed: ${error.message}`, logPath, retryCount: 0,
            });
          }
          if (child.connected) child.disconnect();
        });
      }, delayMs);
      resolve(NATIVE_WORKER);
    });
    child.once("spawn", () => {
      if (!settled) child.send({ type: "prepare", plan }, (error) => { if (error) fail(error); });
    });
  });
}
