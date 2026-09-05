import { test } from "node:test";
import assert from "node:assert/strict";
import { isLoopback } from "../lib/routes.js";

/**
 * The four-layer loopback fence (hardened after dsh-skills-mcp-manager):
 * socket peer + Host header (DNS-rebinding fence) + sec-fetch-site marker +
 * Origin/Host same-origin check.
 */

/** Build a request-like object; `null` simulates a missing value. */
function request({ address = "127.0.0.1", host = "127.0.0.1:3080", origin, fetchSite } = {}) {
  const headers = {};
  if (host !== null) headers.host = host;
  if (origin !== undefined) headers.origin = origin;
  if (fetchSite !== undefined) headers["sec-fetch-site"] = fetchSite;
  const remoteAddress = address === null ? undefined : address;
  return { socket: { remoteAddress }, headers };
}

test("plain loopback request passes", () => {
  assert.equal(isLoopback(request()), true);
});

test("localhost and IPv6 loopback Host headers pass", () => {
  assert.equal(isLoopback(request({ host: "localhost:3080" })), true);
  assert.equal(isLoopback(request({ host: "[::1]:3080" })), true);
});

test("IPv4-mapped and bare IPv6 socket peers pass with a loopback Host", () => {
  assert.equal(isLoopback(request({ address: "::ffff:127.0.0.1" })), true);
  assert.equal(isLoopback(request({ address: "::1", host: "[::1]:3080" })), true);
});

test("non-loopback socket peer is rejected", () => {
  assert.equal(isLoopback(request({ address: "192.168.1.5" })), false);
  assert.equal(isLoopback(request({ address: null })), false);
});

test("missing or non-loopback Host header is rejected (DNS-rebinding fence)", () => {
  assert.equal(isLoopback(request({ host: null })), false);
  assert.equal(isLoopback(request({ host: "" })), false);
  assert.equal(isLoopback(request({ host: "attacker.example:3080" })), false);
  assert.equal(isLoopback(request({ host: "192.168.1.5:3080" })), false);
  assert.equal(isLoopback(request({ host: "not a url" })), false);
});

test("sec-fetch-site: cross-site is rejected, same-origin passes", () => {
  assert.equal(isLoopback(request({ fetchSite: "cross-site" })), false);
  assert.equal(isLoopback(request({ fetchSite: "same-origin" })), true);
  assert.equal(isLoopback(request({ fetchSite: "same-site" })), true);
  assert.equal(isLoopback(request({ fetchSite: "none" })), true);
});

test("a matching Origin passes; a foreign Origin is rejected", () => {
  assert.equal(isLoopback(request({ origin: "http://127.0.0.1:3080" })), true);
  assert.equal(isLoopback(request({ origin: "http://localhost:3080", host: "localhost:3080" })), true);
  assert.equal(isLoopback(request({ origin: "http://attacker.example" })), false);
  assert.equal(isLoopback(request({ origin: "http://127.0.0.1:9999" })), false);
  assert.equal(isLoopback(request({ origin: "null" })), false);
  assert.equal(isLoopback(request({ origin: "::not a url::" })), false);
});

test("Origin-less clients (curl, plain EventSource) still pass", () => {
  const req = request();
  assert.equal("origin" in req.headers, false);
  assert.equal(isLoopback(req), true);
});
