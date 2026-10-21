#!/usr/bin/env node
// Release preflight for one package in this monorepo.
//
// Every package versions and publishes independently, so the only thing that
// can keep them apart is a check that runs before `npm publish`: the version in
// package.json must be new to npm, and its git tag must not exist yet. Run it
// from the repository root:
//
//   node scripts/release-check.mjs dsh-hooks
//
// Exit codes: 0 ready to publish, 1 refused, 2 usage error.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TAG_PREFIX = "v";

function fail(message) {
  console.error(`release-check: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8", ...options }).trim();
}

const name = process.argv[2];
if (!name) {
  console.error("usage: node scripts/release-check.mjs <package-directory-name>");
  process.exit(2);
}

const packageDir = join(root, "packages", name);
const manifestPath = join(packageDir, "package.json");

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(`cannot read ${manifestPath}: ${error.message}`);
}

const { name: packageName, version, private: isPrivate } = manifest;
if (!packageName || !version) fail(`${manifestPath} must declare name and version`);
if (isPrivate) fail(`${packageName} is marked private; remove "private" to publish it`);
if (!manifest.publishConfig?.access) fail(`${packageName} must declare publishConfig.access`);
if (manifest.publishConfig.registry !== "https://registry.npmjs.org/") {
  fail(`${packageName} publishConfig.registry must be https://registry.npmjs.org/`);
}
if (!manifest.engines?.node) fail(`${packageName} must declare engines.node`);

// A version already on npm is immutable; publishing it again is rejected
// upstream and would mean the manifest was not bumped.
let published = [];
try {
  // stderr is captured rather than inherited so a first release, which makes
  // npm print its whole 404 page, stays quiet.
  const raw = run("npm", ["view", packageName, "versions", "--json"], { stdio: ["ignore", "pipe", "pipe"] });
  published = JSON.parse(raw);
  if (!Array.isArray(published)) published = [published];
} catch (error) {
  // A 404 means the package name is not on npm yet, which is fine for a first
  // release. Any other failure means the registry could not be read.
  const text = String(error.stderr ?? error.message);
  if (!/E404|404 Not Found/.test(text)) fail(`cannot query npm for ${packageName}: ${text.trim()}`);
}
if (published.includes(version)) {
  fail(`${packageName}@${version} is already published; bump the version first`);
}

// Tag shape is scoped-package style: v<package-dir>@<version>, e.g.
// vdsh-hooks@2.0.0. It names the directory rather than the npm name so the tag
// reads the same as the path a maintainer works in.
const tag = `${TAG_PREFIX}${name}@${version}`;
let tagExists = false;
try {
  run("git", ["rev-parse", "--quiet", "--verify", `refs/tags/${tag}`]);
  tagExists = true;
} catch {
  tagExists = false;
}
if (tagExists) fail(`tag ${tag} already exists; bump the version instead of moving a tag`);

// The tagged commit must be the one being published, so a stale working tree
// cannot ship under a version whose tag points somewhere else.
let headVersion;
try {
  headVersion = JSON.parse(run("git", ["show", `HEAD:packages/${name}/package.json`])).version;
} catch (error) {
  fail(`cannot read packages/${name}/package.json from HEAD: ${String(error.message).trim()}`);
}
if (headVersion !== version) {
  fail(`working tree has ${version} but HEAD has ${headVersion}; commit the bump before releasing`);
}

const dirty = run("git", ["status", "--porcelain", "--", `packages/${name}`]);
if (dirty) fail(`packages/${name} has uncommitted changes:\n${dirty}`);

console.log(`${packageName}@${version}`);
console.log(`  tag to create : ${tag}`);
console.log(`  published     : ${published.length ? published.join(", ") : "(none)"}`);
console.log("preflight ok");
