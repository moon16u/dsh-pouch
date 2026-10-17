/**
 * Host-side entry for @moon16u/dsh-plugin-session-id.
 *
 * The browser half stays UI-only (the Session ID is supplied by the DSH
 * client runtime). This host half adds exactly one authenticated, read-only
 * route so the header menu can reveal where the current Session is stored on
 * disk:
 *
 *   GET /api/dsh-session-id/directory?sessionId=<id>
 *     -> 200 {ok:true, directory}        resolved session directory path
 *     -> 400 validation failure          (missing / empty id)
 *     -> 404 directory unavailable       (unwritten or unsupported log format)
 *     -> 500 resolution failed           (fixed message only, no internals)
 *     -> 501 persistence backend cannot resolve logs
 *     -> 503 persistence service unavailable
 *
 * The route is resolved through the JSONL persistence backend's public
 * `resolveCurrentLog(id, signal)` API, which only scans directories and has no
 * write side effects. An empty result may also mean an older log generation;
 * it does not establish that the session is missing or unwritten. Registration
 * is deferred with `ctx.inject(['connection'])` and disposed through
 * `ctx.effect(...)` so unload unregisters the route.
 *
 * The response carries a plain filesystem path, not a `file://` URI: the value
 * is meant to be read and pasted, and a URI would add an escaping layer
 * (`%7E` for `~`) without making the path usable anywhere it is not already.
 *
 * @packageDocumentation
 */
import { dirname, sep } from "node:path";

/** Authenticated route serving the on-disk directory of one Session. */
export const SESSION_ID_DIRECTORY_PATH = "/api/dsh-session-id/directory";

/** JSON headers shared by every response of this route. */
const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store"
};

/**
* Register the host-side route on the DSH connection service.
* @param ctx - Host context carrying the connection service.
*/
export function apply(ctx) {
	ctx.inject(["connection"], (scope) => {
		ctx.effect(() => {
			const connection = connectionOf(scope) ?? connectionOf(ctx);
			if (typeof connection?.fetch?.register !== "function") return () => {};
			const dispose = connection.fetch.register({
				path: SESSION_ID_DIRECTORY_PATH,
				methods: ["GET"],
				requestBody: "buffered",
				fetch: async (request) => sessionDirectoryResponse(scope, request)
			});
			return () => {
				if (typeof dispose === "function") dispose();
			};
		}, "session-id: directory route");
	});
}

/**
* Resolve the `connection` service off a context-like object.
* @param ctx - Context or injection scope.
* @returns The connection service, or undefined when not composed yet.
*/
function connectionOf(ctx) {
	return Reflect.get(ctx ?? {}, "connection");
}

/**
* Build the HTTP response for one directory lookup.
* @param scope - Injection scope exposing `sessionPersistence`.
* @param request - Incoming buffered request.
* @returns JSON response; never leaks stack traces or log contents.
*/
async function sessionDirectoryResponse(scope, request) {
	const sessionId = readSessionId(request);
	if (sessionId === undefined || !isValidSessionId(sessionId)) {
		return jsonResponse(400, {
			ok: false,
			error: "invalid_session_id",
			message: "A valid sessionId query parameter is required."
		});
	}
	const persistence = getPersistence(scope);
	if (persistence === undefined || persistence === null) {
		return jsonResponse(503, {
			ok: false,
			error: "persistence_unavailable",
			message: "The session persistence service is unavailable."
		});
	}
	if (typeof persistence.resolveCurrentLog !== "function") {
		return jsonResponse(501, {
			ok: false,
			error: "not_supported",
			message: "This persistence backend cannot resolve session logs."
		});
	}
	let logPath;
	try {
		logPath = await persistence.resolveCurrentLog(sessionId, request.signal);
	} catch {
		return jsonResponse(500, {
			ok: false,
			error: "resolve_failed",
			message: "Failed to resolve the session directory."
		});
	}
	if (typeof logPath !== "string" || logPath.length === 0) {
		return jsonResponse(404, {
			ok: false,
			error: "directory_unavailable",
			message: "The session is not on disk yet, or its log format cannot be located by this API."
		});
	}
	const directory = withTrailingSeparator(dirname(logPath));
	return jsonResponse(200, { ok: true, directory });
}

/**
* Normalize one directory path for display and copying: exactly one trailing
* platform separator, so the value reads as a directory at a glance.
* @param directory - Absolute directory path.
* @returns The path with exactly one trailing separator.
*/
function withTrailingSeparator(directory) {
	let trimmed = directory;
	while (trimmed.endsWith(sep)) trimmed = trimmed.slice(0, -1);
	return trimmed === "" ? directory : trimmed + sep;
}

/**
* Read the `sessionId` query parameter.
* @param request - Incoming request whose `url` carries the query.
* @returns The decoded value, or undefined when absent/unparsable.
*/
function readSessionId(request) {
	const raw = Reflect.get(request ?? {}, "url");
	if (typeof raw !== "string" || raw.length === 0) return undefined;
	let url;
	try {
		url = new URL(raw, "http://localhost");
	} catch {
		return undefined;
	}
	if (!url.searchParams.has("sessionId")) return undefined;
	return url.searchParams.get("sessionId") ?? undefined;
}

/**
* Reject empty ids; opaque ids are encoded by the persistence backend.
* @param sessionId - Candidate session id.
* @returns True when the id is a non-empty string.
*/
function isValidSessionId(sessionId) {
	return typeof sessionId === "string" && sessionId.length > 0;
}

/**
* Read the persistence service from an injection scope.
* @param scope - Injection scope, possibly exposing `get`.
* @returns The service instance, or undefined when absent.
*/
function getPersistence(scope) {
	if (scope === undefined || scope === null) return undefined;
	if (typeof scope.get === "function") return scope.get("sessionPersistence");
	return Reflect.get(scope, "sessionPersistence");
}

/**
* Serialize one JSON response.
* @param status - HTTP status code.
* @param payload - JSON-serializable body.
* @returns Response with the shared JSON/no-store headers.
*/
function jsonResponse(status, payload) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { ...JSON_HEADERS }
	});
}
