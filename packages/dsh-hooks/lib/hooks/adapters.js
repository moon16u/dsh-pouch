import { randomUUID } from "node:crypto";
import { createUserMessage } from "@deepseek-ai/dsh-llm";

export const hookMessage = (text) => createUserMessage({
  source: { kind: "dsh-command-hooks" }, content: [{ type: "text", text }],
});
const textOf = (message) => message.content?.filter((part) => part.type === "text").map((part) => part.text).join("\n") ?? "";

/** Only public, awaited DSH seams may make blocking decisions. */
export function registerAdapters(ctx, engine) {
  const starts = new WeakMap();
  const agents = new WeakMap();
  const compactions = new WeakMap();
  const stopCounts = new WeakMap();
  ctx.on("agent/created", async ({ agent, source, signal }) => {
    engine.register(agent);
    agents.set(agent.session, agent);
    const lifecycle = randomUUID();
    const result = await engine.dispatch("SessionStart", agent, { source }, lifecycle, signal);
    starts.set(agent, result);
    // Parent-scoped subscriptions preserve the actual delegation owner.
    if (agent.ctx?.on) {
      const start = agent.ctx.on("subagent/start", (info) => {
        void engine.dispatch("SubagentStart", agent, { source: info.provider, agent_id: info.id, run_id: info.runId }, info.runId);
      });
      const end = agent.ctx.on("subagent/end", (info) => {
        void engine.dispatch("SubagentStop", agent, { source: info.provider, agent_id: info.id,
          run_id: info.runId, stop_reason: info.stopReason }, info.runId);
      });
      ctx.effect?.(() => () => { start(); end(); });
    }
  });
  ctx.on("agent/pre-step", async ({ agent, messages, signal, turn }, next) => {
    const decision = await next();
    if (signal?.aborted || decision.kind !== "enter" || decision.messages.length === 0) return decision;
    const start = starts.get(agent);
    if (start?.block) {
      starts.delete(agent);
      return { kind: "reject" };
    }
    const contexts = [...(start?.contexts ?? [])];
    for (const message of messages) {
      if (message.source?.kind !== "user") continue;
      stopCounts.delete(agent);
      const result = await engine.dispatch("UserPromptSubmit", agent, { prompt: textOf(message), turn_id: turn },
        message.id ?? `${turn}:${textOf(message)}`, signal);
      if (result.block || signal?.aborted) return { kind: "reject" };
      contexts.push(...result.contexts);
    }
    await drainCompactions(agent, signal, contexts);
    if (signal?.aborted) return decision;
    // A rejected prompt must not discard context produced at session startup.
    starts.delete(agent);
    if (!contexts.length) return decision;
    return { ...decision, messages: [...decision.messages, ...contexts.map(hookMessage)] };
  });
  ctx.on("session/event", (session, event) => {
    if (event.type !== "compaction/end" || event.data?.error !== undefined) return;
    const agent = agents.get(session);
    if (!agent) return;
    const queue = compactions.get(agent) ?? [];
    queue.push(event);
    compactions.set(agent, queue);
  });
  async function drainCompactions(agent, signal, contexts) {
    const events = compactions.get(agent) ?? [];
    compactions.delete(agent);
    for (const event of events) {
      const result = await engine.dispatch("PostCompact", agent, { trigger: event.data.turn == null ? "manual" : "auto" },
        event.data.compactionId ?? event.seq, signal);
      contexts.push(...result.contexts);
    }
  }
  ctx.on("agent/request", async ({ agent, signal }, next) => {
    const config = await next();
    if (signal?.aborted) return config;
    const contexts = [];
    await drainCompactions(agent, signal, contexts);
    if (!signal?.aborted) for (const text of contexts) {
      agent.session.append("user/message", hookMessage(text), { surfaceOp: "append" });
    }
    return config;
  });
  ctx.on("tools/pre-execute", async (exec, next) => {
    if (!exec.agent) return next();
    const result = await engine.dispatch("PreToolUse", exec.agent,
      { tool_name: exec.name, tool_input: exec.arguments, tool_use_id: exec.callId },
      exec.callId, exec.signal);
    if (exec.signal?.aborted) return { kind: "cancel" };
    if (result.block) return { kind: "deny", reason: result.reason };
    const downstream = await next();
    if (downstream.kind !== "allow") return downstream;
    // Hook allow is not an authority grant; native guards still run afterwards.
    return result.ask ? { kind: "ask", reason: result.reason } : downstream;
  });
  ctx.on("tools/post-execute", async (exec, output, next) => {
    const downstream = await next();
    if (!exec.agent) return downstream;
    const result = await engine.dispatch("PostToolUse", exec.agent,
      { tool_name: exec.name, tool_input: exec.arguments, tool_use_id: exec.callId,
        tool_response: output }, exec.callId, exec.signal);
    const additionalContexts = [...(downstream.additionalContexts ?? []), ...result.contexts.map(hookMessage)];
    if (downstream.kind === "block") return { ...downstream, additionalContexts };
    return result.block ? { kind: "block", feedback: [{ type: "text", text: result.reason }], additionalContexts }
      : { ...downstream, additionalContexts };
  });
  ctx.on("approval/request", async (request, next) => {
    const result = await engine.dispatch("PermissionRequest", request.agent,
      { tool_name: request.toolName, tool_use_id: request.callId, reason: request.reason },
      request.callId ?? randomUUID(), request.signal);
    if (request.signal?.aborted) return "cancelled";
    // Never override a native denial or grant permission through an allow hook.
    return result.block ? "rejected" : next();
  });
  ctx.on("agent/turn-stopping", async ({ agent, signal, turn }) => {
    const state = stopCounts.get(agent);
    const count = state?.turn === turn ? state.count : 0;
    if (count >= 3) return;
    stopCounts.set(agent, { turn, count: count + 1 });
    const result = await engine.dispatch("Stop", agent, { turn_id: turn, stop_hook_active: count > 0 }, `${turn}:${count}`, signal);
    if (signal?.aborted) return;
    if (result.block) agent.steer(hookMessage([result.reason, ...result.contexts].join("\n")));
    else for (const text of result.contexts) agent.inject(hookMessage(text));
  });
  ctx.on("agent/disposed", ({ agent }) => {
    agents.delete(agent.session);
    starts.delete(agent);
    compactions.delete(agent);
    void engine.dispatch("SessionEnd", agent, { reason: "agent-disposed" }, randomUUID());
  });
}
