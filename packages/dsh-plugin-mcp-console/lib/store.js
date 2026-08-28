/**
 * Configuration persistence for the MCP console.
 *
 * One JSON document per scope, each shaped `{ version, servers, ui? }` where
 * `servers` maps `serverName -> ServerConfig` (the console's own storage
 * format — NOT the official client's config shape; see clientAdapter.js for
 * the translation). Writes are atomic (temp file + rename) and every write
 * first snapshots the previous file to `<file>.bak.<ts>` so deletions stay
 * recoverable. A corrupt file is renamed aside (`.corrupt.<ts>`) and rebuilt
 * empty — the corruption is surfaced through `lastError`, never silently
 * dropped.
 */
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";

/** Current document schema version. */
export const STORE_VERSION = 1;

/** serverName contract, mirrored from the official mcp-client. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/** Global-scope store path: `$DSH_HOME/dsh-mcp.json` (defaults to ~/.dsh). */
export function globalStorePath(dshHome) {
  const root = dshHome ?? process.env.DSH_HOME ?? join(homedir(), ".dsh");
  return join(root, "dsh-mcp.json");
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
          renameSync(this.path, aside);
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

  /** Persist only the UI config section, keeping servers untouched. */
  writeUi(ui) {
    if (!isPlainObject(ui)) throw new Error("ui config must be an object");
    const doc = this.read();
    this._persist({ ...doc, ui });
    return ui;
  }

  /** Atomically write the document (temp file + rename, no backups). */
  _persist(doc) {
    const body = JSON.stringify(doc, null, 2) + "\n";
    const dir = dirname(this.path);
    mkdirSync(dir, { recursive: true });
    const temp = join(dir, `.${randomBytes(6).toString("hex")}.tmp`);
    writeFileSync(temp, body, "utf8");
    renameSync(temp, this.path);
    this.lastError = null;
  }
}
