import { EVENTS } from "./config.js";
import { commandSpec } from "./shell.js";

export function bounded(text, bytes) {
  const buffer = Buffer.from(String(text));
  if (buffer.length <= bytes) return buffer.toString();
  let end = bytes;
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString();
}

/** No shell interpolation of event data: JSON goes exclusively through stdin. */
export async function runCommand(subprocess, entry, input, signal) {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new Error("hook timeout")), entry.timeout * 1000);
  const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  let handle;
  try {
    if (combined.aborted) throw combined.reason;
    const spec = await commandSpec(subprocess, entry, combined);
    combined.throwIfAborted();
    handle = subprocess.spawn({
      ...spec,
      cwd: entry.cwd,
      stdio: { stdin: { data: JSON.stringify(input) + "\n" },
        stdout: { maxBytes: entry.maxOutputBytes }, stderr: { maxBytes: entry.maxOutputBytes } },
      graceMs: 500, signal: combined,
    });
    const outcome = await handle.done;
    const stdout = handle.collected.stdout.readFrom(0);
    const stderr = handle.collected.stderr.readFrom(0);
    if (signal?.aborted) return { status: "cancelled", error: "Hook cancelled." };
    if (deadline.signal.aborted) return { status: "timeout", error: "Hook timed out." };
    if (stdout.lossy) return { status: "error", error: "stdout exceeded maxOutputBytes; truncated protocol output is not accepted.",
      stderr: stderr.text, exitCode: outcome.exitCode };
    return { status: outcome.exitCode === 0 || outcome.exitCode === 2 ? "completed" : "error",
      error: outcome.exitCode !== 0 && outcome.exitCode !== 2 ? `Command exited with ${outcome.exitCode ?? outcome.signal}` : undefined,
      stdout: stdout.text, stderr: stderr.text, exitCode: outcome.exitCode, stderrTruncated: stderr.lossy };
  } catch (error) {
    return { status: signal?.aborted ? "cancelled" : deadline.signal.aborted ? "timeout" : "error", error: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
    if (handle) {
      // Commands are not daemons: terminate any surviving provider-owned children.
      handle.terminate();
      if (!await handle.waitForExit(AbortSignal.timeout(2000))) throw new Error("Hook process cleanup did not reach quiescence");
    }
  }
}

export function parseOutput(entry, result) {
  if (result.status === "cancelled") return { block: false, contexts: [] };
  if (result.status !== "completed") return { block: entry.onError === "block", reason: result.error ?? result.status, contexts: [] };
  const capabilities = EVENTS[entry.event];
  if (result.exitCode === 2) {
    if (!capabilities.block || entry.async || capabilities.observe) throw new Error("exit 2 cannot block this event");
    return { block: true, reason: bounded(result.stderr || "Blocked by hook.", 4096), contexts: [] };
  }
  const text = (result.stdout ?? "").trim();
  if (!text) return { block: false, contexts: [] };
  let output;
  if (text.startsWith("{") || text.startsWith("[")) {
    try { output = JSON.parse(text); } catch { throw new Error("Malformed hook JSON output"); }
  } else {
    if (!capabilities.context || entry.async || capabilities.observe) throw new Error("Plain stdout context is unsupported for this event");
    return { block: false, contexts: [bounded(text, entry.contextBytes)] };
  }
  if (!output || typeof output !== "object" || Array.isArray(output)) throw new Error("Hook output must be an object");
  const allowed = ["continue", "stopReason", "decision", "reason", "hookSpecificOutput"];
  for (const key of Object.keys(output)) if (!allowed.includes(key)) throw new Error(`Unsupported output field: ${key}`);
  const specific = output.hookSpecificOutput ?? {};
  if (!specific || typeof specific !== "object" || Array.isArray(specific)) throw new Error("Invalid hookSpecificOutput");
  for (const key of Object.keys(specific)) {
    if (!["hookEventName", "additionalContext", "permissionDecision", "permissionDecisionReason"].includes(key)) {
      throw new Error(`Unsupported hook output: ${key} (input rewriting is not supported by DSH)`);
    }
  }
  if (specific.hookEventName !== undefined && specific.hookEventName !== entry.event) throw new Error("hookEventName mismatch");
  if (output.continue !== undefined && typeof output.continue !== "boolean") throw new Error("continue must be boolean");
  if (output.decision !== undefined && output.decision !== "block") throw new Error("Only decision:block is supported");
  for (const value of [output.stopReason, output.reason, specific.additionalContext, specific.permissionDecisionReason]) {
    if (value !== undefined && typeof value !== "string") throw new Error("Hook text fields must be strings");
  }
  const permission = specific.permissionDecision;
  if (permission !== undefined && (!["PreToolUse", "PermissionRequest"].includes(entry.event) || !["allow", "deny", "ask"].includes(permission))) {
    throw new Error("Unsupported permissionDecision");
  }
  if (permission === "ask" && entry.event !== "PreToolUse") throw new Error("PermissionRequest cannot recursively ask for permission");
  const block = output.continue === false || output.decision === "block" || permission === "deny";
  if ((block || permission) && (!capabilities.block || entry.async || capabilities.observe)) throw new Error("This hook is observation-only");
  const context = specific.additionalContext;
  if (context && (!capabilities.context || entry.async || capabilities.observe)) throw new Error("Context output unsupported for this event");
  return { block, ask: permission === "ask",
    reason: bounded(output.stopReason || output.reason || specific.permissionDecisionReason || "Blocked by hook.", 4096),
    contexts: context ? [bounded(context, entry.contextBytes)] : [] };
}
