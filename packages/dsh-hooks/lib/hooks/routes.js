import { randomBytes } from "node:crypto";
import { CONFIG_LIMIT } from "./config.js";

export const API = "/api/dsh-hooks";
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "x-content-type-options": "nosniff" },
});

/** Owner authentication is supplied by connection.fetch; writes add same-origin checks. */
export function registerRoutes(ctx, engine) {
  const reviews = new Map();
  const register = (path, methods, handle) => {
    const dispose = ctx.connection.fetch.register({
      path: API + path, methods, requestBody: methods.includes("POST") ? "streaming" : "buffered",
      async fetch(request) {
        try { return await handle(request, new URL(request.url)); }
        catch (error) { return json({ error: String(error?.message ?? error) }, 400); }
      },
    });
    ctx.effect(() => dispose);
  };
  async function body(request) {
    const url = new URL(request.url);
    // DSH's HTTP bridge uses dsh.internal as Request.url's authority.
    // The authenticated carrier retains the actual Host and Origin headers.
    const origin = new URL(request.headers.get("origin") ?? "about:blank");
    const authority = request.headers.get("host") ?? url.host;
    if (request.method !== "POST" || !["http:", "https:"].includes(origin.protocol) || origin.host !== authority ||
        origin.username || origin.password ||
        request.headers.get("sec-fetch-site") === "cross-site" ||
        request.headers.get("x-dsh-hook-ui") !== "1" ||
        request.headers.get("content-type")?.split(";")[0] !== "application/json") {
      throw new Error("A same-origin Hooks UI request is required");
    }
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing body");
    let bytes = 0;
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > CONFIG_LIMIT + 16384) { await reader.cancel(); throw new Error("Request body is too large"); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Expected an object");
    return data;
  }
  const selectedCwd = (url) => url.searchParams.get("cwd") ?? [...engine.roots][0];
  register("/status", ["GET"], (request, url) => {
    const view = engine.inspect(selectedCwd(url));
    // Environment values are shown only in the explicit review, never the list.
    const redact = (entry) => ({ ...entry, env: Object.keys(entry.env) });
    return json({ ...view, entries: view.entries.map(redact),
      sources: view.sources.map(({ entries, ...source }) => ({ ...source, count: entries.length })),
      history: engine.store.history(view.cwd) });
  });
  register("/review", ["POST"], async (request) => {
    const data = await body(request);
    const entry = engine.current(data.cwd, data.key, data.hash);
    for (const [nonce, review] of reviews) if (review.expires < Date.now()) reviews.delete(nonce);
    if (reviews.size >= 64) throw new Error("Too many pending reviews");
    const nonce = randomBytes(24).toString("hex");
    reviews.set(nonce, { key: entry.key, hash: entry.hash, cwd: entry.cwd, expires: Date.now() + 300000 });
    return json({ entry, nonce, warning: "Commands run as the DSH OS user, outside tool approval and without a hook sandbox. Trust only commands you have reviewed. watchFiles pins listed file contents; other dependencies are not pinned." });
  });
  register("/action", ["POST"], async (request) => {
    const data = await body(request);
    if (data.action === "trust") {
      const review = reviews.get(data.nonce);
      reviews.delete(data.nonce);
      if (!review || review.expires < Date.now() || review.key !== data.key || review.hash !== data.hash ||
          review.cwd !== data.cwd || data.confirmation !== "RUN AS DSH USER") throw new Error("Review expired or confirmation missing");
    } else if (!["revoke", "disable", "enable"].includes(data.action)) throw new Error("Unsupported action");
    engine.change(data.action, data.cwd, data.key, data.hash);
    return json({ ok: true });
  });
  ctx.effect(() => () => reviews.clear());
}
