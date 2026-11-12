#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function verifyRestartPackage(archive) {
  const listing = execFileSync("tar", ["-tvzf", archive], { encoding: "utf8" });
  const entry = listing.split("\n").find((line) => line.endsWith(" package/scripts/dsh-restart.sh"));
  if (!entry || !entry.startsWith("-rwxr-xr-x ")) {
    throw new Error(`Restart package must contain scripts/dsh-restart.sh with mode 0755; got ${entry || "missing script"}`);
  }
  return entry;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) {
    console.error("usage: node scripts/verify-restart-package.mjs <tarball>");
    process.exitCode = 2;
  } else {
    try {
      console.log(verifyRestartPackage(process.argv[2]));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
