import { closeSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

const TRANSIENT_WINDOWS_ERRORS = new Set(["EACCES", "EBUSY", "EPERM"]);
const waitArray = new Int32Array(new SharedArrayBuffer(4));
const sleepSync = (ms) => { Atomics.wait(waitArray, 0, 0, ms); };

// Matches DSH 687f282e's util/atomic-write retry policy. The store's existing
// synchronous contract is retained; Windows contention can block for 1.1 s.
export function renameAtomicSync(source, target, {
  platform = process.platform,
  rename = renameSync,
  sleep = sleepSync,
} = {}) {
  let delay = 20;
  for (let retries = 0; ; retries += 1) {
    try {
      rename(source, target);
      return;
    } catch (error) {
      if (platform !== "win32" || !TRANSIENT_WINDOWS_ERRORS.has(error?.code) || retries >= 8) throw error;
    }
    sleep(delay);
    delay = Math.min(delay * 2, 200);
  }
}

/** Exclusive sibling temp + native replacement; never delete the old target. */
export function writeFileAtomicSync(filename, content) {
  mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const temp = `${filename}.${randomBytes(6).toString("hex")}.tmp`;
  let fd;
  let created = false;
  try {
    fd = openSync(temp, "wx", 0o600);
    created = true;
    writeFileSync(fd, content, "utf8");
    closeSync(fd);
    fd = undefined;
    renameAtomicSync(temp, filename);
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch {}
    }
    if (created) {
      try { unlinkSync(temp); } catch {}
    }
    throw error;
  }
}
