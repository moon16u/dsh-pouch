#!/usr/bin/env node
// Create the release tag for one package, after the preflight passes.
//
//   node scripts/release-tag.mjs dsh-hooks
//
// The tag is annotated and points at HEAD, which release-check.mjs has already
// confirmed carries the same version that is about to be published. Push it
// with `git push origin <tag>`; nothing here talks to the remote.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function fail(message) {
  console.error(`release-tag: ${message}`);
  process.exit(1);
}

const name = process.argv[2];
if (!name) {
  console.error("usage: node scripts/release-tag.mjs <package-directory-name>");
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8"));
} catch (error) {
  fail(`cannot read packages/${name}/package.json: ${error.message}`);
}

const tag = `v${name}@${manifest.version}`;
const message = `${manifest.name}@${manifest.version}`;

// `git rev-parse --verify` exits 1 when the ref is absent, which is the case
// this script expects. Anything else is a real failure worth reporting.
let tagExists = false;
try {
  execFileSync("git", ["rev-parse", "--quiet", "--verify", `refs/tags/${tag}`], {
    cwd: root,
    stdio: "ignore",
  });
  tagExists = true;
} catch (error) {
  if (error.status !== 1) fail(`cannot inspect refs/tags/${tag}`);
}
if (tagExists) fail(`tag ${tag} already exists`);

try {
  execFileSync("git", ["tag", "-a", tag, "-m", message], { cwd: root, stdio: "inherit" });
} catch {
  fail(`cannot create tag ${tag}`);
}

console.log(`created ${tag} at HEAD`);
console.log(`push it with: git push origin ${tag}`);
