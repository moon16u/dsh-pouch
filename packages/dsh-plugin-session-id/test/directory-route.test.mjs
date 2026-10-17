/**
 * Tests for the host-side session-directory route of
 * @moon16u/dsh-plugin-session-id.
 *
 * Every case runs against a fake cordis context: no DSH process, no real
 * ~/.dsh access, no temp files, no network.
 *
 * The route returns a plain filesystem path (the value the user reads and
 * pastes), so no URI escaping or platform-specific rendering is involved: the
 * backend resolves a real path and the route only trims the filename and
 * normalizes the trailing separator.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname as posixDirname, win32 } from "node:path";
import { apply, SESSION_ID_DIRECTORY_PATH } from "../lib/index.js";

const ROUTE_URL = "http://localhost/api/dsh-session-id/directory";

/**
 * Build a fake cordis context recording injections, effects and route
 * registrations.
 * @param {{persistence?: unknown, connectionOnScope?: boolean}} [options]
 * @returns Fake context with inspection helpers.
 */
function makeCtx(options = {}) {
	const registrations = [];
	const disposers = [];
	const injectCalls = [];
	const scope = options.connectionOnScope
		? { sessionPersistence: options.persistence, connection: makeConnection(registrations) }
		: { sessionPersistence: options.persistence };
	const connection = makeConnection(registrations);
	const ctx = {
		connection,
		get: (name) => (name === "sessionPersistence" ? options.persistence : undefined),
		inject: (names, callback) => {
			injectCalls.push(names);
			return callback(scope);
		},
		effect: (callback, label) => {
			const dispose = callback();
			disposers.push({ label, dispose });
			return dispose;
		}
	};
	return {
		ctx,
		registrations,
		injectCalls,
		scope,
		disposeAll: () => {
			for (const entry of disposers) entry.dispose?.();
		}
	};
}

/** Create a connection service stand-in capturing fetch.register calls. */
function makeConnection(registrations) {
	return {
		fetch: {
			register: (options) => {
				const record = { options, disposed: 0 };
				registrations.push(record);
				return () => {
					record.disposed += 1;
				};
			}
		}
	};
}

/** Invoke the registered route with a query string and return its Response. */
async function call(registrations, query, signal) {
	const record = registrations[0];
	assert.ok(record, "the route must be registered");
	return record.options.fetch(new Request(`${ROUTE_URL}${query}`, { signal }));
}

/** Assert the shared JSON/no-store headers are present. */
function assertJsonHeaders(response) {
	assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
	assert.equal(response.headers.get("cache-control"), "no-store");
}

test("registers the directory route only after the connection is injected", () => {
	const fake = makeCtx({ persistence: { resolveCurrentLog: async () => undefined } });
	apply(fake.ctx);
	assert.deepEqual(fake.injectCalls, [["connection"]]);
	assert.equal(fake.registrations.length, 1);
	assert.equal(fake.registrations[0].options.path, SESSION_ID_DIRECTORY_PATH);
	assert.deepEqual(fake.registrations[0].options.methods, ["GET"]);
	assert.equal(fake.registrations[0].options.requestBody, "buffered");
	assert.equal(typeof fake.registrations[0].options.fetch, "function");
});

test("disposing the effect unregisters the route exactly once", () => {
	const fake = makeCtx({ persistence: { resolveCurrentLog: async () => undefined } });
	apply(fake.ctx);
	assert.equal(fake.registrations[0].disposed, 0);
	fake.disposeAll();
	assert.equal(fake.registrations[0].disposed, 1);
});

test("does not register when the connection service is missing", () => {
	const fake = makeCtx({ persistence: { resolveCurrentLog: async () => undefined } });
	delete fake.ctx.connection;
	apply(fake.ctx);
	assert.equal(fake.registrations.length, 0);
});

test("200: returns the containing directory as a plain trailing-separator path", async () => {
	const dir = "/tmp/_tmp_wb logs/会话目录";
	const persistence = makePersistence("/tmp/_tmp_wb logs/会话目录/session.jsonl");
	const fake = makeCtx({ persistence });
	apply(fake.ctx);

	const response = await call(fake.registrations, "?sessionId=abc-123");
	assert.equal(response.status, 200);
	assertJsonHeaders(response);
	const body = await response.json();
	assert.deepEqual(body, { ok: true, directory: `${dir}/` });
	assert.ok(!body.directory.startsWith("file://"), "a plain path, not a URI");
	assert.ok(!body.directory.includes("%20"), "paths are not percent-encoded");
	assert.ok(body.directory.endsWith("/"), "a trailing separator marks it as a directory");
	assert.ok(!body.directory.endsWith("//"), "exactly one trailing separator");
	// The raw spelling must round-trip: this is the value the user pastes.
	assert.equal(body.directory, "/tmp/_tmp_wb logs/会话目录/");
});

test("200: persistence is also reachable through the injection scope", async () => {
	const dir = "/var/log/dsh";
	const persistence = makePersistence(`${dir}/s.jsonl`);
	const fake = makeCtx({ persistence, connectionOnScope: true });
	apply(fake.ctx);
	const response = await call(fake.registrations, "?sessionId=s-1");
	assert.equal(response.status, 200);
	assert.equal((await response.json()).directory, `${dir}/`);
});

test("400: missing and empty sessionId values are rejected before persistence", async () => {
	const seen = [];
	const fake = makeCtx({ persistence: {
		resolveCurrentLog: async (id) => { seen.push(id); return "/tmp/_tmp_wb/s.jsonl"; }
	} });
	apply(fake.ctx);
	for (const query of ["", "?sessionId="]) {
		const response = await call(fake.registrations, query);
		assert.equal(response.status, 400);
		assertJsonHeaders(response);
		assert.equal((await response.json()).error, "invalid_session_id");
	}
	assert.deepEqual(seen, []);
});

test("200: opaque session ids reach the backend unchanged", async () => {
	const seen = [];
	const fake = makeCtx({ persistence: {
		resolveCurrentLog: async (id) => { seen.push(id); return "/tmp/_tmp_wb/s.jsonl"; }
	} });
	apply(fake.ctx);
	const ids = [
		"a/b", "a\\b", ".", "..", "a\0b", "a\nb", "a\rb", "a\tb",
		"a\u0001b", "a\u001Fb", "a\u007Fb", "a\u0085b", "a".repeat(201),
		"会话 1&x=y#z%41"
	];
	for (const id of ids) {
		const response = await call(fake.registrations, `?sessionId=${encodeURIComponent(id)}`);
		assert.equal(response.status, 200, `expected 200 for ${JSON.stringify(id)}`);
	}
	assert.deepEqual(seen, ids);
});

test("404: an empty resolution does not classify historical logs as unwritten", async () => {
	for (const logPath of [undefined, ""]) {
		const persistence = makePersistence(logPath);
		for (const method of ["stat", "open", "list", "flush", "findLog", "locate"]) {
			persistence[method] = () => assert.fail(`route must not call ${method}`);
		}
		const fake = makeCtx({ persistence });
		apply(fake.ctx);
		const response = await call(fake.registrations, "?sessionId=historical-or-unwritten");
		assert.equal(response.status, 404);
		assertJsonHeaders(response);
		assert.deepEqual(await response.json(), {
			ok: false,
			error: "directory_unavailable",
			message: "The session is not on disk yet, or its log format cannot be located by this API."
		});
	}
});

test("501: a backend without resolveCurrentLog is reported as unsupported", async () => {
	const fake = makeCtx({ persistence: { name: "session-persistence-inmemory" } });
	apply(fake.ctx);
	const response = await call(fake.registrations, "?sessionId=abc");
	assert.equal(response.status, 501);
	assert.equal((await response.json()).error, "not_supported");
});

test("503: a missing persistence service is reported as unavailable", async () => {
	const fake = makeCtx({});
	apply(fake.ctx);
	const response = await call(fake.registrations, "?sessionId=abc");
	assert.equal(response.status, 503);
	assert.equal((await response.json()).error, "persistence_unavailable");
});

test("500: a throwing resolver returns a fixed body without stack or internals", async () => {
	const fake = makeCtx({
		persistence: {
			resolveCurrentLog: async () => {
				throw new Error("secret-token at /home/user/.dsh/logs");
			}
		}
	});
	apply(fake.ctx);
	const response = await call(fake.registrations, "?sessionId=abc");
	assert.equal(response.status, 500);
	assertJsonHeaders(response);
	const text = await response.text();
	assert.equal(JSON.parse(text).error, "resolve_failed");
	assert.doesNotMatch(text, /stack/i);
	assert.doesNotMatch(text, /secret-token/);
	assert.doesNotMatch(text, /\.dsh/);
});

test("resolver receives the session id and the request abort signal", async () => {
	let seen;
	const controller = new AbortController();
	const fake = makeCtx({
		persistence: {
			resolveCurrentLog: async (id, signal) => {
				seen = { id, signal };
				return "/tmp/_tmp_wb/s.jsonl";
			}
		}
	});
	apply(fake.ctx);
	await call(fake.registrations, "?sessionId=s-42", controller.signal);
	assert.equal(seen.id, "s-42");
	// The route forwards whatever signal the runtime attached to the request;
	// `Request` may re-wrap it, so assert presence rather than identity.
	assert.ok(seen.signal instanceof AbortSignal);
	assert.equal(seen.signal.aborted, controller.signal.aborted);
});

test("200: route preserves Linux backslashes and root directories", { skip: process.platform === "win32" }, async () => {
	for (const [logPath, directory] of [
		["/store/folder\\/session.jsonl", "/store/folder\\/"],
		["/store/folder\\\\/session.jsonl", "/store/folder\\\\/"],
		["/session.jsonl", "/"],
		["/a b/会话/session.jsonl", "/a b/会话/"]
	]) {
		const fake = makeCtx({ persistence: makePersistence(logPath) });
		apply(fake.ctx);
		const response = await call(fake.registrations, "?sessionId=s-1");
		assert.equal(response.status, 200);
		assert.equal((await response.json()).directory, directory);
	}
});

test("Windows-style log paths reduce to their directory without URI escaping", () => {
	// Pure path arithmetic is portable: the backend resolves a real path and the
	// route only trims the filename, so no platform-specific URI rendering runs.
	const winLog = "C:\\a b\\logs\\x.jsonl";
	assert.equal(win32.dirname(winLog), "C:\\a b\\logs");
	assert.equal(posixDirname("/tmp/_tmp_wb logs/x.jsonl"), "/tmp/_tmp_wb logs");
});

/** Minimal jsonl-style backend stand-in resolving to a fixed log path. */
function makePersistence(logPath) {
	return {
		name: "session-persistence-jsonl",
		resolveCurrentLog: async () => logPath
	};
}
