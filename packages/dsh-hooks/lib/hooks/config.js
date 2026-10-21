import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const EVENTS = Object.freeze({
  SessionStart: { context: true, block: true },
  UserPromptSubmit: { context: true, block: true },
  PreToolUse: { context: false, block: true },
  PostToolUse: { context: true, block: true },
  PermissionRequest: { context: false, block: true },
  Stop: { context: true, block: true },
  PostCompact: { context: true, block: false },
  SessionEnd: { context: false, block: false, observe: true },
  SubagentStart: { context: false, block: false, observe: true },
  SubagentStop: { context: false, block: false, observe: true },
});
export const CONFIG_LIMIT = 256 * 1024;
export const MAX_HOOKS = 64;
export const hash = (value) => createHash("sha256").update(value).digest("hex");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function keys(value, allowed, label) {
  if (!object(value)) throw new Error(`${label}: expected an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label}: unsupported field ${key}`);
}
function integer(value, fallback, min, max, label) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error(`${label}: expected ${min}..${max}`);
  return result;
}
function boolean(value, fallback, label) {
  if (value !== undefined && typeof value !== "boolean") throw new Error(`${label}: expected boolean`);
  return value ?? fallback;
}

/** Bounded glob alternatives, not arbitrary regular expressions. */
export function validateMatcher(pattern = "*") {
  if (typeof pattern !== "string" || pattern.length > 256 || pattern.split("|").length > 16 ||
      !/^[\w.*?:/-]*(?:\|[\w.*?:/-]+)*$/.test(pattern)) {
    throw new Error("matcher: use glob alternatives (*, ?, |), not regular expressions");
  }
  return pattern || "*";
}
export function matches(pattern, input) {
  const text = String(input ?? "").slice(0, 512);
  return pattern.split("|").some((part) => {
    let row = Array(text.length + 1).fill(false);
    row[0] = true;
    for (const token of part) {
      const next = Array(text.length + 1).fill(false);
      next[0] = token === "*" && row[0];
      for (let j = 1; j <= text.length; j++) {
        next[j] = token === "*" ? row[j] || next[j - 1] : row[j - 1] && (token === "?" || token === text[j - 1]);
      }
      row = next;
    }
    return row[text.length];
  });
}

export function parseConfig(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > CONFIG_LIMIT) throw new Error("hook document exceeds 256 KiB");
  const document = JSON.parse(text || '{"version":1,"hooks":{}}');
  keys(document, ["version", "description", "hooks"], "document");
  if (document.version !== undefined && document.version !== 1) throw new Error("unsupported hook document version");
  if (!object(document.hooks)) throw new Error("hooks: expected an event map");
  const entries = [];
  const ids = new Set();
  for (const [event, groups] of Object.entries(document.hooks)) {
    if (!Object.hasOwn(EVENTS, event)) throw new Error(`unsupported event: ${event}`);
    if (!Array.isArray(groups)) throw new Error(`${event}: expected matcher groups`);
    for (const group of groups) {
      keys(group, ["matcher", "hooks"], event);
      const matcher = validateMatcher(group.matcher);
      if (!Array.isArray(group.hooks)) throw new Error(`${event}: expected handlers`);
      for (const raw of group.hooks) {
        keys(raw, ["id", "type", "command", "timeout", "maxOutputBytes", "contextBytes",
          "async", "enabled", "subagents", "onError", "env", "watchFiles", "statusMessage"], event);
        if (raw.type !== "command") throw new Error("only type: command is supported");
        if (typeof raw.id !== "string" || !/^[a-zA-Z0-9][\w.-]{0,63}$/.test(raw.id) || ids.has(raw.id)) {
          throw new Error("each handler needs a unique id (1..64 letters, digits, _, . or -)");
        }
        ids.add(raw.id);
        if (typeof raw.command !== "string" || !raw.command.trim() || raw.command.length > 16384 || raw.command.includes("\0")) {
          throw new Error(`${raw.id}: command must contain 1..16384 characters without NUL`);
        }
        const env = raw.env ?? {};
        keys(env, Object.keys(env), `${raw.id}.env`);
        if (Object.keys(env).length > 32) throw new Error("env: at most 32 explicit variables");
        for (const [key, value] of Object.entries(env)) {
          if (!/^[A-Za-z_]\w*$/.test(key) || typeof value !== "string" || value.length > 8192 || value.includes("\0")) {
            throw new Error(`invalid explicit environment: ${key}`);
          }
        }
        const watchFiles = raw.watchFiles ?? [];
        if (!Array.isArray(watchFiles) || watchFiles.length > 16 ||
            watchFiles.some((file) => typeof file !== "string" || !file || file.includes("\0") || file.length > 4096)) {
          throw new Error("watchFiles: at most 16 file paths");
        }
        const asynchronous = boolean(raw.async, false, "async");
        const onError = raw.onError ?? "continue";
        if (!["continue", "block"].includes(onError)) throw new Error("onError: expected continue or block");
        if (onError === "block" && (asynchronous || !EVENTS[event].block)) {
          throw new Error(`${event}: onError:block requires a synchronous blocking event`);
        }
        if (raw.statusMessage !== undefined && (typeof raw.statusMessage !== "string" || raw.statusMessage.length > 256)) {
          throw new Error("statusMessage: at most 256 characters");
        }
        entries.push({
          id: raw.id, type: "command", event, matcher, command: raw.command,
          timeout: integer(raw.timeout, EVENTS[event].observe ? 3 : 30, 1, EVENTS[event].observe ? 10 : 600, "timeout"),
          maxOutputBytes: integer(raw.maxOutputBytes, 65536, 256, 1048576, "maxOutputBytes"),
          contextBytes: integer(raw.contextBytes, 16384, 1, 262144, "contextBytes"),
          async: asynchronous, enabled: boolean(raw.enabled, true, "enabled"),
          subagents: boolean(raw.subagents, false, "subagents"), onError,
          env: Object.fromEntries(Object.entries(env).sort(([a], [b]) => a.localeCompare(b))),
          watchFiles: [...new Set(watchFiles)].sort(), statusMessage: raw.statusMessage ?? "",
        });
        if (entries.length > MAX_HOOKS) throw new Error("at most 64 hooks per document");
      }
    }
  }
  return entries;
}

function fileText(path) {
  if (!existsSync(path)) return null;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > CONFIG_LIMIT) throw new Error("hook source must be a regular file of at most 256 KiB");
  return readFileSync(path, "utf8");
}
export function projectRoot(cwd) {
  let path = realpathSync(cwd);
  const start = path;
  while (true) {
    if (existsSync(join(path, ".git"))) return path;
    const parent = dirname(path);
    if (parent === path) return start;
    path = parent;
  }
  // A non-Git workspace is confined to cwd, not every ancestor of HOME.
}
export function discover({ cwd, home, profile = "web", profileConfig = "" }) {
  const canonical = realpathSync(cwd);
  if (!statSync(canonical).isDirectory()) throw new Error("cwd must be a directory");
  const sources = [
    { id: `profile:${profile}`, label: "profile", path: null, text: profileConfig },
    { id: join(home, "hooks.json"), label: "user", path: join(home, "hooks.json") },
    { id: join(projectRoot(canonical), ".dsh", "hooks.json"), label: "project", path: join(projectRoot(canonical), ".dsh", "hooks.json") },
  ];
  const entries = [];
  for (const source of sources) {
    try {
      const text = source.path ? fileText(source.path) : source.text;
      source.present = text !== null;
      source.entries = parseConfig(text ?? '{"hooks":{}}').map((definition) => {
        const key = hash(JSON.stringify([canonical, source.id, definition.id]));
        return { ...definition, key, cwd: canonical, source: source.id, sourceLabel: source.label };
      });
      entries.push(...source.entries);
    } catch (error) {
      source.error = String(error.message);
      source.entries = [];
    }
    delete source.text;
  }
  return { cwd: canonical, sources, entries };
}

/** Trust binds the normalized definition, execution directory and selected files. */
export function fingerprint(entry) {
  const pinned = entry.watchFiles.map((file) => {
    const path = resolve(entry.cwd, file);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error("watchFiles must be regular files of at most 1 MiB");
    return [isAbsolute(file) ? path : file, hash(readFileSync(path))];
  });
  return hash(JSON.stringify({ ...entry, pinned }));
}
