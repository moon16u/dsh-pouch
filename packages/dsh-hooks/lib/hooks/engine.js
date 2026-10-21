import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { discover, EVENTS, fingerprint, matches } from "./config.js";
import { bounded, parseOutput, runCommand } from "./runner.js";

const empty = () => ({ block: false, ask: false, contexts: [] });
const message = (error) => String(error?.message ?? error);

/** Process-local scheduling and at-most-once event dispatch; no automatic replay. */
export class HookEngine {
  constructor({ store, subprocess, home, profile, getConfig, cwd, logger, execute = runCommand }) {
    Object.assign(this, { store, subprocess, home, profile, getConfig, logger, execute });
    this.roots = new Set([realpathSync(cwd)]);
    this.lifetime = new AbortController();
    this.pending = new Set();
    this.seen = new Map();
    this.active = 0;
    this.queue = [];
  }
  register(agent) {
    if (agent?.session?.header?.cwd) {
      try { this.roots.add(realpathSync(agent.session.header.cwd)); } catch { /* Deleted workspace. */ }
    }
  }
  config() {
    const raw = this.getConfig();
    return { enabled: raw.commandHooksEnabled !== false, profileConfig: raw.commandHooks ?? '{"version":1,"hooks":{}}' };
  }
  inspect(cwd) {
    const canonical = realpathSync(cwd);
    if (!this.roots.has(canonical)) throw new Error("Workspace is not attached to this host");
    const view = discover({ cwd: canonical, home: this.home, profile: this.profile, profileConfig: this.config().profileConfig });
    for (const entry of view.entries) {
      try {
        entry.hash = fingerprint(entry);
        entry.trusted = this.store.trusted(entry.key, entry.hash);
      } catch (error) { entry.error = message(error); entry.trusted = false; }
      entry.disabled = this.store.disabled(entry.key);
    }
    return { ...view, enabled: this.config().enabled, roots: [...this.roots], events: EVENTS };
  }
  current(cwd, key, digest) {
    const entry = this.inspect(cwd).entries.find((item) => item.key === key);
    if (!entry || entry.error || entry.hash !== digest) throw new Error("Hook changed; refresh and review it again");
    return entry;
  }
  change(action, cwd, key, digest) {
    if (action === "disable" || action === "revoke") {
      const entry = this.inspect(cwd).entries.find((item) => item.key === key);
      if (!entry) throw new Error("Hook no longer exists");
      this.store.change(action, entry.key, "");
      return;
    }
    const entry = this.current(cwd, key, digest);
    this.store.change(action, entry.key, entry.hash);
  }
  async slot(signal) {
    if (signal.aborted) throw signal.reason;
    if (this.active < 4) { this.active++; return; }
    if (this.queue.length >= 64) throw new Error("Hook execution queue is full");
    await new Promise((resolve, reject) => {
      const entry = { resolve, reject, signal };
      entry.abort = () => {
        const at = this.queue.indexOf(entry);
        if (at >= 0) this.queue.splice(at, 1);
        reject(signal.reason);
      };
      signal.addEventListener("abort", entry.abort, { once: true });
      this.queue.push(entry);
    });
  }
  release() {
    const queued = this.queue.shift();
    if (queued) {
      queued.signal.removeEventListener("abort", queued.abort);
      queued.resolve();
    } else this.active--;
  }
  dispatch(event, agent, extra = {}, identity, signal) {
    if (!this.config().enabled || this.lifetime.signal.aborted) return Promise.resolve(empty());
    this.register(agent);
    const session = agent?.session;
    const cwd = session?.header?.cwd;
    if (!cwd || !session.header.id) return Promise.resolve(empty());
    const key = JSON.stringify([session.header.id, event, identity]);
    if (this.seen.has(key)) return this.seen.get(key);
    const task = this.dispatchOnce(event, agent, extra, identity, signal).catch((error) => {
      this.logger?.warn?.(`dsh-hooks: ${message(error)}`);
      // Configuration/infrastructure errors cannot silently execute a requested tool.
      return { block: EVENTS[event].block, reason: `Hook infrastructure error: ${message(error)}`, contexts: [] };
    });
    this.seen.set(key, task);
    // Entries are scoped to event instances; repeat Stop checks intentionally use new identities.
    if (this.seen.size > 2048) this.seen.delete(this.seen.keys().next().value);
    return task;
  }
  async dispatchOnce(event, agent, extra, identity, signal) {
    const view = this.inspect(agent.session.header.cwd);
    const invalid = view.sources.filter((source) => source.error);
    if (invalid.length) throw new Error(invalid.map((source) => `${source.id}: ${source.error}`).join("; "));
    const sessionId = agent.session.header.id;
    const matchInput = extra.tool_name ?? extra.source ?? extra.trigger ?? "";
    const input = { ...extra, hook_event_name: event, session_id: sessionId,
      cwd: view.cwd, event_id: String(identity), model: agent.options?.model ?? null };
    if (Buffer.byteLength(JSON.stringify(input)) > 1024 * 1024) throw new Error("Hook input exceeds 1 MiB");
    const selected = view.entries.filter((entry) =>
      entry.event === event && entry.enabled && !entry.disabled &&
      (entry.subagents || !agent.session.header.parentSession));
    const jobs = [];
    for (const entry of selected) {
      if (!matches(entry.matcher, matchInput)) continue;
      const job = this.run(entry, input, signal);
      this.pending.add(job);
      void job.finally(() => this.pending.delete(job)).catch(() => {});
      if (!entry.async && !EVENTS[event].observe) jobs.push(job);
    }
    const results = await Promise.all(jobs);
    return {
      block: results.some((result) => result.block),
      ask: results.some((result) => result.ask),
      reason: results.filter((result) => result.block || result.ask).map((result) => result.reason).join("\n").slice(0, 8192),
      contexts: limitContexts(results.flatMap((result) => result.contexts)),
    };
  }
  async run(entry, input, signal) {
    const record = { id: randomUUID(), hookId: entry.id, event: entry.event, eventId: input.event_id,
      key: entry.key, hash: entry.hash, source: entry.source, cwd: entry.cwd,
      sessionId: input.session_id, startedAt: new Date().toISOString(), status: "running" };
    const combined = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
    let occupied = false;
    let parsed = empty();
    try {
      if (entry.error || !entry.trusted) {
        record.status = entry.error ? "invalid" : "untrusted";
        record.error = entry.error ?? "Not executed: review and trust this definition in the Hooks UI.";
        return empty();
      }
      await this.slot(combined);
      occupied = true;
      // Recheck after waiting: editing/revoking a queued hook invalidates that launch.
      const current = this.current(entry.cwd, entry.key, entry.hash);
      if (!this.config().enabled || !current.trusted || current.disabled || !current.enabled) {
        record.status = "skipped";
        record.error = "Hook disabled, revoked or changed before execution.";
        return empty();
      }
      this.store.record(record);
      const result = await this.execute(this.subprocess, entry, input, combined);
      Object.assign(record, { status: result.status, exitCode: result.exitCode, error: result.error,
        stderr: this.redact(bounded(result.stderr ?? "", 4096), entry), stderrTruncated: result.stderrTruncated });
      parsed = parseOutput(entry, result);
      if (parsed.block) record.status = "blocked";
      if (parsed.block || parsed.ask) record.decisionReason = this.redact(parsed.reason, entry);
      if (parsed.contexts.length) record.contextBytes = parsed.contexts.reduce((sum, text) => sum + Buffer.byteLength(text), 0);
      return entry.async || EVENTS[entry.event].observe ? empty() : parsed;
    } catch (error) {
      record.status = combined.aborted ? "cancelled" : "error";
      record.error = this.redact(message(error), entry);
      return { block: !combined.aborted && entry.onError === "block", reason: record.error, contexts: [] };
    } finally {
      if (occupied) this.release();
      record.endedAt = new Date().toISOString();
      try { this.store.record(record); }
      catch (error) { this.logger?.warn?.(`dsh-hooks: cannot persist execution status: ${message(error)}`); }
    }
  }
  redact(text, entry) {
    for (const value of Object.values(entry.env)) if (value) text = text.split(value).join("[redacted]");
    return text.replace(/(Bearer\s+)[\w./+=-]+/gi, "$1[redacted]");
  }
  async dispose() {
    this.lifetime.abort(new Error("Hook plugin disposed"));
    await Promise.allSettled([...this.pending]);
    this.seen.clear();
  }
}

function limitContexts(contexts) {
  let remaining = 262144;
  const boundedContexts = [];
  for (const text of contexts.slice(0, 64)) {
    const value = bounded(text, remaining);
    if (value) boundedContexts.push(value);
    remaining -= Buffer.byteLength(value);
    if (remaining <= 0) break;
  }
  return boundedContexts;
}
