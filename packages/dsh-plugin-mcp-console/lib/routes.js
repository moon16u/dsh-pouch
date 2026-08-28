/**
 * HTTP API (plan §5.4): everything under `/api/dsh-mcp-console/`, registered
 * as one prefix route on the web profile's `webServer` service.
 *
 * | Method | Path                        | Semantics                          |
 * |--------|-----------------------------|------------------------------------|
 * | GET    | /health                     | liveness + store paths             |
 * | GET    | /servers                    | full snapshot (secrets masked)     |
 * | POST   | /servers                    | add (body = server config)         |
 * | PATCH  | /servers/:name              | edit (masked secrets round-trip)   |
 * | DELETE | /servers/:name              | remove                             |
 * | POST   | /servers/:name/enable       | enable + assemble                  |
 * | POST   | /servers/:name/disable      | dispose (config kept)              |
 * | POST   | /servers/:name/reconnect    | fiber.restart()                    |
 * | POST   | /import                     | mcpServers JSON import             |
 * | GET    | /events                     | SSE status stream                  |
 * | GET    | /config                     | UI config (non-secret)             |
 * | PUT    | /config                     | persist UI config                  |
 *
 * Loopback fence: every mutating and secret-bearing route answers 403 to
 * non-loopback callers; GET /config (UI placement only) is open so a LAN
 * browser can at least read placement while the data routes stay local.
 */
import { computeSnapshot } from "./status.js";
import { ConsoleError } from "./orchestrator.js";
import { parseMcpServers } from "./import.js";
import { exportStoreToProfileYaml } from "./yamlMigrator.js";

export const ROUTE_PREFIX = "/api/dsh-mcp-console";

/** Max accepted JSON body (mcpServers imports can be chunky but not huge). */
const BODY_LIMIT = 1024 * 1024;

const STATUS_BY_CODE = { invalid: 400, conflict: 409, not_found: 404, internal: 500 };

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Register the API on the webserver.
 *
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {object} services
 * @param {import("./orchestrator.js").Orchestrator} services.orchestrator
 * @param {import("./store.js").Store} services.uiStore store holding the `ui` section
 * @returns {{ dispose: () => void, notify: () => void }} route handle
 */
export function registerRoutes(ctx, { orchestrator, uiStore }) {
  const sseClients = new Set();
  let heartbeat = null;
  let notifyTimer = null;
  let dirty = false;

  const disposeRoute = ctx.webServer.register({
    kind: "prefix",
    path: ROUTE_PREFIX,
    handler: (req, res) => {
      handle(req, res).catch((error) => {
        if (res.headersSent) {
          res.end();
          return;
        }
        const code = error instanceof ConsoleError ? error.code : "internal";
        respond(res, STATUS_BY_CODE[code] ?? 500, { error: { code, message: String(error?.message ?? error) } });
      });
    },
  });

  heartbeat = setInterval(() => {
    for (const client of sseClients) {
      try {
        client(": ping\n\n");
      } catch {
        // broken pipe: close handler will reap the client
      }
    }
  }, 25000);
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  /**
   * Broadcast a status_changed SSE frame (throttled 500ms, plan §5.3).
   * Frames carry the full snapshot; identical consecutive snapshots are
   * skipped, so polling and event storms never spam open panels.
   */
  let lastSent = null;
  function notify() {
    dirty = true;
    if (notifyTimer) return;
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      if (!dirty) return;
      dirty = false;
      const snapshot = JSON.stringify(computeSnapshot(orchestrator));
      if (snapshot === lastSent) return;
      lastSent = snapshot;
      const frame = `event: status_changed\ndata: ${snapshot}\n\n`;
      for (const client of sseClients) {
        try {
          client(frame);
        } catch {
          // reaped by close handler
        }
      }
    }, 500);
    if (typeof notifyTimer.unref === "function") notifyTimer.unref();
  }

  async function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const segments = url.pathname.slice(ROUTE_PREFIX.length).split("/").filter(Boolean).map(decodeURIComponent);
    const method = req.method ?? "GET";

    // loopback fence: everything except GET /config
    const isConfigRead = method === "GET" && segments.length === 1 && segments[0] === "config";
    if (!isConfigRead && !isLoopback(req)) {
      respond(res, 403, { error: { code: "forbidden", message: "loopback only" } });
      return;
    }

    if (segments[0] === "health" && method === "GET") {
      respond(res, 200, {
        ok: true,
        plugin: "mcp-console",
        globalStore: orchestrator.globalStore.path,
        projectStore: orchestrator.projectStore?.path ?? null,
        managed: [...orchestrator.ledger.keys()].sort(),
        disabledTools: [...orchestrator.disabledToolSet].sort(),
        profileYaml: orchestrator.profileYamlPath,
        ingestError: orchestrator.ingestError,
      });
      return;
    }

    if (segments[0] === "refresh" && method === "POST") {
      respond(res, 200, await orchestrator.refresh());
      return;
    }

    if (segments[0] === "export-yaml" && method === "POST") {
      const result = await exportStoreToProfileYaml({ store: orchestrator.globalStore });
      respond(res, 200, result);
      return;
    }

    if (segments[0] === "servers") {
      await handleServers(req, res, method, segments.slice(1));
      return;
    }

    if (segments[0] === "import" && method === "POST") {
      const body = await readJson(req);
      const text = typeof body?.json === "string" ? body.json : typeof body?.text === "string" ? body.text : "";
      if (text.length === 0) {
        respond(res, 400, { error: { code: "invalid", message: "body must be { json: \"<mcpServers JSON>\" }" } });
        return;
      }
      const { servers, errors } = parseMcpServers(text);
      const result = await orchestrator.importServers(servers);
      respond(res, 200, { ...result, parseErrors: errors });
      return;
    }

    if (segments[0] === "events" && method === "GET") {
      handleSse(req, res);
      return;
    }

    if (segments[0] === "config") {
      if (method === "GET") {
        respond(res, 200, { ui: sanitizeUi(uiStore.read().ui) });
        return;
      }
      if (method === "PUT" || method === "POST") {
        const body = await readJson(req);
        respond(res, 200, { ui: sanitizeUi(uiStore.writeUi(sanitizeUi(body?.ui ?? {}))) });
        return;
      }
      respond(res, 405, { error: { code: "method_not_allowed", message: "GET or PUT /config" } });
      return;
    }

    respond(res, 404, { error: { code: "not_found", message: `unknown route ${method} ${url.pathname}` } });
  }

  async function handleServers(req, res, method, rest) {
    if (rest.length === 0) {
      if (method === "GET") {
        respond(res, 200, computeSnapshot(orchestrator));
        return;
      }
      if (method === "POST") {
        const body = await readJson(req);
        const result = await orchestrator.add(body ?? {});
        respond(res, 201, result);
        return;
      }
      respond(res, 405, { error: { code: "method_not_allowed", message: "GET or POST /servers" } });
      return;
    }

    const [name, action] = rest;
    if (action === undefined) {
      if (method === "PATCH") {
        const body = await readJson(req);
        respond(res, 200, await orchestrator.update(name, body ?? {}));
        return;
      }
      if (method === "DELETE") {
        respond(res, 200, await orchestrator.remove(name));
        return;
      }
      respond(res, 405, { error: { code: "method_not_allowed", message: "PATCH or DELETE /servers/:name" } });
      return;
    }

    if (method !== "POST") {
      respond(res, 405, { error: { code: "method_not_allowed", message: `POST /servers/:name/${action}` } });
      return;
    }
    if (action === "enable") respond(res, 200, await orchestrator.setEnabled(name, true));
    else if (action === "disable") respond(res, 200, await orchestrator.setEnabled(name, false));
    else if (action === "reconnect") respond(res, 200, await orchestrator.reconnect(name));
    else respond(res, 404, { error: { code: "not_found", message: `unknown action "${action}"` } });
  }

  function handleSse(req, res) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write("retry: 3000\n\n");
    const send = (frame) => res.write(frame);
    sseClients.add(send);
    // initial snapshot so a freshly opened panel renders immediately
    send(`event: status_changed\ndata: ${JSON.stringify(computeSnapshot(orchestrator))}\n\n`);
    req.on("close", () => {
      sseClients.delete(send);
    });
  }

  function dispose() {
    disposeRoute();
    if (heartbeat) clearInterval(heartbeat);
    if (notifyTimer) clearTimeout(notifyTimer);
    for (const client of sseClients) {
      try {
        client("event: bye\ndata: {}\n\n");
      } catch {
        // already gone
      }
    }
    sseClients.clear();
  }

  return { dispose, notify };
}

function isLoopback(req) {
  const address = req?.socket?.remoteAddress;
  return typeof address === "string" && LOOPBACK_ADDRESSES.has(address);
}

function respond(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new ConsoleError("invalid", `body exceeds ${BODY_LIMIT} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(new ConsoleError("invalid", `invalid JSON body: ${String(error?.message ?? error)}`));
      }
    });
    req.on("error", reject);
  });
}

const UI_POSITIONS = new Set(["top-right", "bottom-right"]);

/** Only known, non-secret UI keys survive into the store. */
export function sanitizeUi(ui) {
  const out = { position: "top-right", offsetX: 8, offsetY: 8 };
  if (ui === null || typeof ui !== "object") return out;
  if (UI_POSITIONS.has(ui.position)) out.position = ui.position;
  out.offsetX = clampInt(ui.offsetX, 0, 256, out.offsetX);
  out.offsetY = clampInt(ui.offsetY, 0, 256, out.offsetY);
  return out;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}
