import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

/** Bounded Windows sharing-violation retries, as in dsh-atomic-write. */
export function replaceState(temp, path, {
  platform = process.platform, rename = renameSync,
  wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
} = {}) {
  let delay = 20;
  for (let retries = 0;; retries++) {
    try { rename(temp, path); return; } catch (error) {
      if (platform !== "win32" || !["EACCES", "EBUSY", "EPERM"].includes(error.code) || retries >= 8) throw error;
      wait(delay);
      delay = Math.min(delay * 2, 200);
    }
  }
}

/** Small host-owned ledger. Never accepts trust declarations from project files. */
export class HookStore {
  constructor(path) {
    this.path = path;
    this.data = { version: 1, trust: {}, disabled: {}, runs: [] };
    if (existsSync(path)) {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error("hook state must be a regular file under 4 MiB");
      const data = JSON.parse(readFileSync(path, "utf8"));
      if (data.version !== 1 || !data.trust || Array.isArray(data.trust) || !data.disabled ||
          Array.isArray(data.disabled) || !Array.isArray(data.runs) || data.runs.length > 200 ||
          data.runs.some((run) => !run || typeof run !== "object" || typeof run.id !== "string")) throw new Error("invalid hook state");
      this.data = data;
      for (const run of data.runs) if (run.status === "running") {
        run.status = "interrupted";
        run.error = "Host stopped before completion; commands are not replayed.";
      }
    }
  }
  flush() {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    let created = false;
    try {
      const fd = openSync(temp, "wx", 0o600);
      created = true;
      try { writeFileSync(fd, JSON.stringify(this.data, null, 2) + "\n"); } finally { closeSync(fd); }
      replaceState(temp, this.path);
    } catch (error) {
      if (created) unlinkSync(temp);
      throw error;
    }
  }
  trusted(key, digest) { return this.data.trust[key]?.hash === digest; }
  disabled(key) { return this.data.disabled[key] === true; }
  change(action, key, digest) {
    const before = structuredClone(this.data);
    if (action === "trust") this.data.trust[key] = { hash: digest, at: new Date().toISOString() };
    else if (action === "revoke") delete this.data.trust[key];
    else if (action === "disable") this.data.disabled[key] = true;
    else if (action === "enable") delete this.data.disabled[key];
    else throw new Error("unknown hook action");
    try { this.flush(); } catch (error) { this.data = before; throw error; }
  }
  record(run) {
    const existing = this.data.runs.findIndex((item) => item.id === run.id);
    if (existing < 0) this.data.runs.push(run);
    else this.data.runs[existing] = run;
    this.data.runs = this.data.runs.slice(-200);
    this.flush();
  }
  history(cwd) { return this.data.runs.filter((run) => run.cwd === cwd).slice(-100).reverse(); }
}
