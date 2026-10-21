import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apply } from "../lib/index.js";

test("manifest excludes the official Desktop profile, not Windows/macOS operating systems", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.dsh.unsupportedProfiles, ["desktop"]);
  assert.equal(manifest.os, undefined);
});

test("a bypassed Desktop install fails before registering commands, tools or effects", () => {
  const unexpected = () => assert.fail("Desktop must never activate restart behavior");
  assert.throws(() => apply({
    get: (name) => name === "profileContext" ? { name: "desktop" } : undefined,
    commands: { register: unexpected },
    tools: { register: unexpected },
    inject: unexpected,
    effect: unexpected,
  }), /Web-only.*Desktop on Windows\/macOS is not supported/);
});
