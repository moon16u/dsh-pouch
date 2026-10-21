import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { nativeEnvironment } from "./native-restart.js";

const ERROR_SERVER = fileURLToPath(new URL("../scripts/dsh-restart-error-server.js", import.meta.url));
const WORKER = fileURLToPath(new URL("../scripts/dsh-restart-worker.mjs", import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === "ESRCH") return false;
    throw error; // Unreadable is not proof that the old host has exited.
  }
}

export function webResponds(origin) {
  return new Promise((resolve) => {
    const url = new URL(origin);
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    // This credential-free probe addresses the application's own listener,
    // including local TLS configurations using a self-signed certificate.
    const req = request(url, { method: "GET", timeout: 1000, rejectUnauthorized: false }, (res) => {
      res.resume();
      resolve(true); // DSH's unauthenticated 401 is a healthy listener.
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
    req.end();
  });
}

export function validateNativePlan(plan) {
  if (!plan || typeof plan.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(plan.id) || !Number.isInteger(plan.ownerPid) || plan.ownerPid <= 0
    || typeof plan.executable !== "string" || !Array.isArray(plan.args) || !plan.args.every((arg) => typeof arg === "string")
    || typeof plan.home !== "string" || typeof plan.cwd !== "string" || typeof plan.origin !== "string") {
    throw new Error("Invalid native restart plan.");
  }
  if (!["http:", "https:"].includes(new URL(plan.origin).protocol)) throw new Error("Invalid native restart origin.");
  return plan;
}

function persistFailure(plan, reason, previousPid) {
  const path = join(plan.home, "restart-failed.json");
  let old = {};
  try { old = JSON.parse(readFileSync(path, "utf8")); } catch {}
  const origin = new URL(plan.origin);
  const failure = {
    source: "schedule",
    attemptId: plan.id,
    sessionId: plan.sessionId,
    time: new Date().toISOString(),
    reason,
    logPath: join(plan.home, "dsh-web.out.log"),
    profileHome: plan.home,
    port: Number(origin.port || (origin.protocol === "https:" ? 443 : 80)),
    mode: "native",
    scriptPath: WORKER,
    nativePlan: { ...plan, ownerPid: previousPid },
    retryCount: old.retryCount || 0,
    lastRetryAt: old.lastRetryAt || "",
  };
  mkdirSync(plan.home, { recursive: true });
  writeFileSync(path, JSON.stringify(failure), { mode: 0o600 });
  return path;
}

export async function runNativeRestart(plan, internals = {}) {
  validateNativePlan(plan);
  const alive = internals.alive || processAlive;
  const responds = internals.responds || webResponds;
  const pause = internals.sleep || sleep;
  const spawnChild = internals.spawn || spawn;
  let previousPid = plan.ownerPid;
  const env = nativeEnvironment(process.env, plan.home, plan.platform);
  try {
    // appExit has a 5s bound in the official CLI. Allow more time, but never
    // kill a process or start a competing instance if shutdown did not finish.
    for (let n = 0; n < 40 && alive(plan.ownerPid); n++) await pause(250);
    if (alive(plan.ownerPid)) throw new Error("The original DSH host did not exit within 10 seconds; no replacement was started.");
    if (await responds(plan.origin)) throw new Error("The Web port is already occupied; no competing DSH instance was started.");
    const fd = openSync(join(plan.home, "dsh-web.out.log"), "a", 0o600);
    let child;
    try {
      child = spawnChild(plan.executable, plan.args, {
        cwd: plan.cwd, env, detached: true, windowsHide: true,
        stdio: ["ignore", fd, fd],
      });
    } finally {
      closeSync(fd);
    }
    let ended = false;
    let spawnError;
    child.once("exit", () => { ended = true; });
    child.once("error", (error) => { spawnError = error; });
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    previousPid = child.pid;
    child.unref();
    writeFileSync(join(plan.home, "dsh-restart.pid"), String(child.pid));
    for (let n = 0; n < 60; n++) {
      if (spawnError) throw spawnError;
      if (ended || !alive(child.pid)) throw new Error("The replacement DSH process exited during startup.");
      if (await responds(plan.origin)) {
        if (ended) throw new Error("The replacement DSH process exited during startup.");
        const marker = join(plan.home, "restart-failed.json");
        // Preserve the previous diagnostic instead of destroying it.
        if (existsSync(marker)) renameSync(marker, join(plan.home, `restart-failed.${plan.id}.resolved.json`));
        return;
      }
      await pause(500);
    }
    throw new Error("The replacement DSH Web server did not become ready within 30 seconds.");
  } catch (error) {
    const marker = persistFailure(plan, error.message, previousPid);
    console.error("[dsh-restart]", error.message);
    // An existing host/foreign listener must never be displaced by an error page.
    const origin = new URL(plan.origin);
    if (internals.errorPage !== false && origin.protocol === "http:" && !await responds(plan.origin)) {
      const fd = openSync(join(plan.home, "dsh-restart-error-server.log"), "a", 0o600);
      try {
        const child = spawnChild(plan.executable, [ERROR_SERVER, "--config", marker], {
          env, detached: true, windowsHide: true, stdio: ["ignore", fd, fd],
        });
        child.on("error", (failure) => console.error("[dsh-restart] error page:", failure.message));
        child.unref();
      } finally { closeSync(fd); }
    }
  }
}
