import { after } from "node:test";
import { existsSync, mkdtempSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots = new Set();

export function tempDir(label) {
  const root = mkdtempSync(join(tmpdir(), `_tmp_mcp-${label}-`));
  roots.add(root);
  return root;
}

// Preserve fixtures for inspection; do not recursively delete directories or
// traverse junctions into installed dependencies.
export function recoverTempDir(root) {
  if (!roots.delete(root) || !existsSync(root)) return;
  renameSync(root, `${root}.recovered`);
}

after(() => {
  for (const root of roots) recoverTempDir(root);
});
