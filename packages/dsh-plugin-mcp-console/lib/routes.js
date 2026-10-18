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
 * | POST   | /servers/:name/probe        | side-fiber connectivity test       |
 * | POST   | /import                     | mcpServers JSON import             |
 * | GET    | /events                     | SSE status stream                  |
 * | GET    | /config                     | UI config (non-secret)             |
 * | PUT    | /config                     | persist UI config                  |
 *
 * Loopback fence: every mutating and secret-bearing route answers 403 to
 * non-loopback callers; GET /config (UI placement only) is open so a LAN
 * browser can at least read placement while the data routes stay local.
 * "Loopback" is four checks at once (hardened after dsh-skills-mcp-manager):
 * a loopback socket peer, a Host header naming a loopback origin (DNS
 * rebinding fence), no `sec-fetch-site: cross-site` browser marker, and —
 * when an Origin header is present — an Origin matching the Host.
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

/** Host header hostnames accepted as loopback (IPv6 keeps its brackets). */
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * Register the API on the webserver.
 *
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {object} services
 * @param {import("./orchestrator.js").Orchestrator} services.orchestrator
 * @param {import("./store.js").Store} services.uiStore store holding the `ui` section
 * @param {() => {enabled: boolean, announceToAgent: boolean}} [services.getPluginConfig]
 *        resolved master switches (settings-GUI backed), surfaced in /health
 * @returns {{ dispose: () => void, notify: () => void }} route handle
 */
export function registerRoutes(ctx, { orchestrator, uiStore, getPluginConfig, resolveOrchestrator }) {
  const sseClients = new Set();
  let heartbeat = null;
  let notifyTimer = null;
  let dirty = false;
  let disposed = false;

  function sessionIdOf(req) {
    try {
      return new URL(req.url ?? "/", "http://localhost").searchParams.get("sessionId") || undefined;
    } catch {
      return undefined;
    }
  }

  function orchestratorFor(req) {
    // A resolver is passed in rather than attached to the Cordis context:
    // assigning an undeclared property there throws ("cannot set property …
    // without provide") and would abort the whole composition.
    try {
      return resolveOrchestrator?.(sessionIdOf(req)) ?? orchestrator;
    } catch {
      return orchestrator;
    }
  }

  /**
   * One request's console view. The global console answers with its own
   * snapshot; a project-aware aggregate merges the global and project lists
   * into a single manageable set.
   */
  function viewOf(target) {
    return typeof target?.snapshot === "function" ? target.snapshot() : computeSnapshot(target);
  }

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
        client.send(": ping\n\n");
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
  const lastSent = new Map();
  function notify() {
    dirty = true;
    if (notifyTimer) return;
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      if (!dirty) return;
      dirty = false;
      for (const client of sseClients) {
        try {
          const snapshot = JSON.stringify(viewOf(client.orchestrator));
          if (snapshot === lastSent.get(client)) continue;
          lastSent.set(client, snapshot);
          client.send(`event: status_changed\ndata: ${snapshot}\n\n`);
        } catch {
          // reaped by close handler
        }
      }
    }, 500);
    if (typeof notifyTimer.unref === "function") notifyTimer.unref();
  }

  async function handle(req, res) {
    if (disposed) {
      respond(res, 404, { error: { code: "not_found", message: "MCP console is disabled" } });
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const segments = url.pathname.slice(ROUTE_PREFIX.length).split("/").filter(Boolean).map(decodeURIComponent);
    const method = req.method ?? "GET";

    // loopback fence: everything except GET /config
    const isConfigRead = method === "GET" && segments.length === 1 && segments[0] === "config";
    if (!isConfigRead && !isLoopback(req)) {
      respond(res, 403, { error: { code: "forbidden", message: "loopback only" } });
      return;
    }

    const current = orchestratorFor(req);
    if (segments[0] === "health" && method === "GET") {
      respond(res, 200, {
        ok: true,
        plugin: "mcp-console",
        config: getPluginConfig ? getPluginConfig() : null,
        globalStore: current.globalStore.path,
        projectStore: current.projectStore?.path ?? null,
        managed: [...current.ledger.keys()].sort(),
        disabledTools: [...current.disabledToolSet].sort(),
        profileYaml: current.profileYamlPath,
        ingestError: current.ingestError,
      });
      return;
    }

    if (segments[0] === "refresh" && method === "POST") {
      respond(res, 200, await current.refresh());
      return;
    }

    if (segments[0] === "export-yaml" && method === "POST") {
      const result = await exportStoreToProfileYaml({ store: current.globalStore });
      respond(res, 200, result);
      return;
    }

    if (segments[0] === "servers") {
      await handleServers(current, req, res, method, segments.slice(1));
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
      const result = await current.importServers(servers);
      respond(res, 200, { ...result, parseErrors: errors });
      return;
    }

    if (segments[0] === "events" && method === "GET") {
      handleSse(current, req, res);
      return;
    }

    if (segments[0] === "config") {
      if (method === "GET") {
        const storeDoc = uiStore.read();
        respond(res, 200, {
          ui: sanitizeUi(storeDoc.ui),
          config: getPluginConfig ? getPluginConfig() : null,
        });
        return;
      }
      if (method === "PUT" || method === "POST") {
        const body = await readJson(req);
        let updatedUi;
        if (body?.ui !== undefined) {
          updatedUi = sanitizeUi(uiStore.writeUi(sanitizeUi(body.ui)));
        }
        let updatedConfig;
        if (body?.config !== undefined) {
          throw new ConsoleError("invalid", "Plugin switches are managed by the official settings form; /config only stores UI placement");
        }
        respond(res, 200, {
          ui: updatedUi ?? sanitizeUi(uiStore.read().ui),
          config: updatedConfig ?? (getPluginConfig ? getPluginConfig() : null),
        });
        return;
      }
      respond(res, 405, { error: { code: "method_not_allowed", message: "GET or PUT /config" } });
      return;
    }

    respond(res, 404, { error: { code: "not_found", message: `unknown route ${method} ${url.pathname}` } });
  }

  async function handleServers(current, req, res, method, rest) {
    if (rest.length === 0) {
      if (method === "GET") {
        respond(res, 200, viewOf(current));
        return;
      }
      if (method === "POST") {
        const body = await readJson(req);
        const result = await current.add(body ?? {});
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
        respond(res, 200, await current.update(name, body ?? {}));
        return;
      }
      if (method === "DELETE") {
        respond(res, 200, await current.remove(name));
        return;
      }
      respond(res, 405, { error: { code: "method_not_allowed", message: "PATCH or DELETE /servers/:name" } });
      return;
    }

    if (method !== "POST") {
      respond(res, 405, { error: { code: "method_not_allowed", message: `POST /servers/:name/${action}` } });
      return;
    }
    if (action === "enable") respond(res, 200, await current.setEnabled(name, true));
    else if (action === "disable") respond(res, 200, await current.setEnabled(name, false));
    else if (action === "reconnect") respond(res, 200, await current.reconnect(name));
    else if (action === "probe") respond(res, 200, await current.probe(name));
    else respond(res, 404, { error: { code: "not_found", message: `unknown action "${action}"` } });
  }

  function handleSse(current, req, res) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write("retry: 3000\n\n");
    const client = { orchestrator: current, send: (frame) => res.write(frame), close: () => res.end() };
    sseClients.add(client);
    // initial snapshot so a freshly opened panel renders immediately
    client.send(`event: status_changed\ndata: ${JSON.stringify(viewOf(current))}\n\n`);
    lastSent.set(client, JSON.stringify(viewOf(current)));
    req.on("close", () => {
      sseClients.delete(client);
      res.end();
    });
  }

  function dispose() {
    disposed = true;
    disposeRoute();
    if (heartbeat) clearInterval(heartbeat);
    if (notifyTimer) clearTimeout(notifyTimer);
    for (const client of sseClients) {
      try {
        client.send("event: bye\ndata: {}\n\n");
        client.close();
      } catch {
        // already gone
      }
    }
    sseClients.clear();
    lastSent.clear();
  }

  return { dispose, notify };
}

/**
 * Loopback fence, four layers deep (borrowed from dsh-skills-mcp-manager):
 *  1. the socket peer is a loopback address;
 *  2. the Host header names a loopback origin — a DNS-rebindable name
 *     (e.g. attacker.example) resolves publicly but the browser sends it in
 *     Host; rejecting non-loopback Hosts closes that hole;
 *  3. no `sec-fetch-site: cross-site` marker (browsers always send it on
 *     cross-site fetches; non-browser clients simply omit it);
 *  4. when an Origin is present it must match the Host (same-origin) —
 *     Origin-less clients (curl, EventSource in older stacks) pass.
 *
 * @param {import("node:http").IncomingMessage} req
 */
export function isLoopback(req) {
  const address = req?.socket?.remoteAddress;
  if (typeof address !== "string" || !LOOPBACK_ADDRESSES.has(address)) return false;
  const host = req?.headers?.host;
  if (typeof host !== "string" || host.length === 0) return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (!LOOPBACK_HOSTNAMES.has(hostUrl.hostname)) return false;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let originUrl;
    try {
      originUrl = new URL(origin);
    } catch {
      return false;
    }
    if (originUrl.host !== hostUrl.host) return false;
  }
  return true;
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
