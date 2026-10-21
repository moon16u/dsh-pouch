/**
 * Configuration persistence for the MCP console.
 *
 * One JSON document per scope, each shaped `{ version, servers, ui? }` where
 * `servers` maps `serverName -> ServerConfig` (the console's own storage
 * format — NOT the official client's config shape; see clientAdapter.js for
 * the translation). Writes are atomic (temp file + rename), without backups.
 * A corrupt file is renamed aside (`.corrupt.<ts>`) and rebuilt
 * empty — the corruption is surfaced through `lastError`, never silently
 * dropped.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { renameAtomicSync, writeFileAtomicSync } from "./atomicFile.js";

/** Current document schema version. */
export const STORE_VERSION = 1;

/** Global-scope store path: `$DSH_HOME/dsh-mcp.json` (defaults to ~/.dsh). */
export function globalStorePath(dshHome) {
  return join(resolveDshHome(dshHome), "dsh-mcp.json");
}

/** Project-scope store path: `<workspace>/.dsh/mcp.json`. */
export function projectStorePath(workspaceRoot) {
  return join(workspaceRoot, ".dsh", "mcp.json");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function emptyDoc() {
  return { version: STORE_VERSION, servers: {} };
}

/** Normalize one parsed document; returns `{ doc, error }`. */
export function normalizeDoc(raw) {
  if (raw === undefined || raw === null) return { doc: emptyDoc(), error: null };
  if (!isPlainObject(raw)) return { doc: emptyDoc(), error: "store root must be a JSON object" };
  const doc = {
    version: typeof raw.version === "number" ? raw.version : STORE_VERSION,
    servers: {},
    ...(isPlainObject(raw.ui) ? { ui: raw.ui } : {}),
    ...(isPlainObject(raw.config) ? { config: raw.config } : {}),
  };
  if (isPlainObject(raw.servers)) {
    for (const [name, entry] of Object.entries(raw.servers)) {
      if (isPlainObject(entry)) doc.servers[name] = entry;
    }
  }
  const error = isPlainObject(raw.servers) ? null : "`servers` missing or not an object; rebuilt empty";
  return { doc, error };
}

/**
 * One persisted document with atomic writes (temp file + rename).
 *
 * Deletions are the user's explicit intent, so no backup files are kept:
 * every write replaces the previous file directly. `read()` re-reads from
 * disk, so external edits (a user fixing a config by hand) are not clobbered.
 */
export class Store {
  /**
   * @param {string} filePath absolute path of the JSON document
   */
  constructor(filePath) {
    this.path = filePath;
    /** Last read/write failure, surfaced in the panel (never silently dropped). */
    this.lastError = null;
  }

  /** Read the document from disk; corrupt files are moved aside and rebuilt. */
  read() {
    let raw;
    if (existsSync(this.path)) {
      try {
        raw = JSON.parse(readFileSync(this.path, "utf8"));
      } catch (error) {
        const aside = `${this.path}.corrupt.${timestamp()}`;
        try {
          renameAtomicSync(this.path, aside);
          this.lastError = `config file was corrupt; moved to ${aside} and rebuilt empty (${String(error?.message ?? error)})`;
        } catch (renameError) {
          this.lastError = `config file is corrupt and could not be moved aside (${String(renameError?.message ?? renameError)})`;
        }
        raw = undefined;
      }
    }
    const { doc, error } = normalizeDoc(raw);
    if (error && !this.lastError) this.lastError = error;
    return doc;
  }

  /**
   * Mutate the servers map through `mutate(servers)` and persist atomically.
   * `mutate` returning `false` cancels the write (validation failed).
   * @returns the mutate() result
   */
  mutate(mutate) {
    const doc = this.read();
    const servers = { ...doc.servers };
    const result = mutate(servers);
    if (result === false) return result;
    this._persist({ ...doc, servers });
    return result;
  }

  /** Atomically write the document (temp file + rename, no backups). */
  _persist(doc) {
    const body = JSON.stringify(doc, null, 2) + "\n";
    writeFileAtomicSync(this.path, body);
    this.lastError = null;
  }
}
