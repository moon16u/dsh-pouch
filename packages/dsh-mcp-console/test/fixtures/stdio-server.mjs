import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";

// Local protocol fixture only: no network or user configuration.
writeFileSync("started.json", JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), pid: process.pid }));
const input = createInterface({ input: process.stdin });
input.on("line", line => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  let result;
  if (request.method === "initialize") {
    result = {
      protocolVersion: request.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: "mcp-console-native-fixture", version: "1.0.0" },
    };
  } else if (request.method === "tools/list") {
    result = { tools: [{ name: "echo", description: "Local fixture", inputSchema: { type: "object" } }] };
  } else if (request.method === "tools/call") {
    result = { content: [{ type: "text", text: "fixture" }] };
  } else {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Unknown method" } }) + "\n");
    return;
  }
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n");
});
