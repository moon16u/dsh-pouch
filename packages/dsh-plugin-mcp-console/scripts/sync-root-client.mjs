#!/usr/bin/env node
/**
 * Sync the mcp-console client body into the dsh-pouch root client bundle.
 *
 * The root `lib/client.js` factory (id "@moon16u/dsh-pouch") physically
 * contains every pouch plugin's client half; the standalone package copy
 * (`packages/dsh-plugin-mcp-console/lib/client.js`, id
 * "@moon16u/dsh-plugin-mcp-console") is the source of truth. This script
 * copies the marked body between the two files (the body carries its own
 * `react` and `@deepseek-ai/dsh-client-ui-primitives` requires, both platform
 * seeds). Idempotent; run from the package directory:
 *
 *   node scripts/sync-root-client.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const standalonePath = join(here, "..", "lib", "client.js");
const rootPath = join(here, "..", "..", "..", "lib", "client.js");

const START = "    // ==== mcp-console client body (synced; keep identical to dsh-pouch/lib/client.js) ====";
const END = "    // ==== end mcp-console client body ====";

function extractBody(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("standalone client.js is missing the sync markers");
  }
  return text.slice(start, end + END.length) + "\n";
}

const standalone = readFileSync(standalonePath, "utf8");
const body = extractBody(standalone);

let root = readFileSync(rootPath, "utf8");
if (!root.includes('var IconCheckOutline16 = require("@deepseek-ai/dsh-client-ui-primitives").IconCheckOutline16;')) {
  throw new Error("root client.js anchor (ui-primitives require) not found");
}
if (!root.includes("    exports.HeadersSection = HeadersSection;")) {
  throw new Error("root client.js anchor (exports block) not found");
}

// drop the react-dom seed require an older mcp-console body added (unused now)
root = root.replace('    var ReactDom = require("react-dom");\n', "");

// splice the marked body before the root exports block
const start = root.indexOf(START);
const end = root.indexOf(END);
if (start !== -1 && end !== -1 && end > start) {
  root = root.slice(0, start) + body.trimEnd() + root.slice(end + END.length);
} else {
  root = root.replace(
    "    exports.HeadersSection = HeadersSection;",
    body.trimEnd() + "\n\n    exports.HeadersSection = HeadersSection;",
  );
}

writeFileSync(rootPath, root, "utf8");
console.log("synced mcp-console client body ->", rootPath);
