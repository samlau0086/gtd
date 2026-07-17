import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import pg from "pg";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3300";
const email = process.env.ADMIN_EMAIL || "admin@example.test";
const bootstrapToken = process.env.BOOTSTRAP_TOKEN || "integration-bootstrap-token";

async function json(url, init = {}) {
  const response = await fetch(`${base}${url}`, init);
  const body = await response.json().catch(() => ({}));
  assert.ok(response.ok, `${init.method || "GET"} ${url}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const login = await json("/api/auth/bootstrap", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, token: bootstrapToken }),
});
const auth = { authorization: `Bearer ${login.accessToken}`, "content-type": "application/json" };
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function createPat(name, scope) {
  return json("/api/mcp-tokens", { method: "POST", headers: auth, body: JSON.stringify({ name, scope, expiresInDays: 30 }) });
}

async function connect(rawToken) {
  const client = new Client({ name: "gtd-flow-integration", version: "1.0.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${rawToken}` } } });
  await client.connect(transport);
  return client;
}

const writePat = await createPat("integration-write", "write");
const client = await connect(writePat.token);

const tools = await client.listTools();
const names = new Set(tools.tools.map((tool) => tool.name));
for (const name of ["get_gtd_overview", "list_tasks", "create_task", "update_task", "complete_task", "set_task_dependencies", "preview_delete_task", "delete_task", "list_projects", "create_project", "update_project", "preview_delete_project", "delete_project", "list_tags", "create_tag", "update_tag", "preview_delete_tag", "delete_tag", "decompose_task_with_ai", "commit_task_decomposition"]) assert.ok(names.has(name), `missing tool ${name}`);

const overview = await client.callTool({ name: "get_gtd_overview", arguments: {} });
assert.equal(overview.isError, undefined);
assert.equal(typeof overview.structuredContent.dataVersion, "number");

const projectResult = await client.callTool({ name: "create_project", arguments: { name: "MCP 集成测试", color: "#69d2c8" } });
assert.equal(projectResult.isError, undefined);
const project = projectResult.structuredContent.record;
assert.equal(project.revision, 1);

const taskResult = await client.callTool({ name: "create_task", arguments: { title: "通过 MCP 创建任务", projectId: project.id, status: "next", estimate: 2 } });
assert.equal(taskResult.isError, undefined);
const task = taskResult.structuredContent.record;
assert.equal(task.revision, 1);

const listed = await client.callTool({ name: "list_tasks", arguments: { query: "通过 MCP", limit: 10 } });
assert.equal(listed.structuredContent.items.length, 1);
assert.equal(listed.structuredContent.items[0].id, task.id);

const updated = await client.callTool({ name: "update_task", arguments: { taskId: task.id, expectedRevision: task.revision, patch: { important: true, dueDate: "2030-01-02" } } });
assert.equal(updated.structuredContent.record.revision, 2);

const stale = await client.callTool({ name: "complete_task", arguments: { taskId: task.id, expectedRevision: 1, completed: true } });
assert.equal(stale.isError, true);

const resource = await client.readResource({ uri: "gtd://overview" });
assert.equal(resource.contents[0].mimeType, "application/json");
assert.equal(typeof JSON.parse(resource.contents[0].text).dataVersion, "number");
const prompt = await client.getPrompt({ name: "weekly_review", arguments: {} });
assert.ok(prompt.messages[0].content.text.includes("每周回顾"));

const preview = await client.callTool({ name: "preview_delete_task", arguments: { taskId: task.id } });
assert.equal(preview.structuredContent.impact.deletedTasks, 1);
const deleted = await client.callTool({ name: "delete_task", arguments: { taskId: task.id, confirmationToken: preview.structuredContent.confirmationToken } });
assert.equal(deleted.isError, undefined);
const repeated = await client.callTool({ name: "delete_task", arguments: { taskId: task.id, confirmationToken: preview.structuredContent.confirmationToken } });
assert.equal(repeated.isError, true);

const readPat = await createPat("integration-read", "read");
const readClient = await connect(readPat.token);
const readOverview = await readClient.callTool({ name: "get_gtd_overview", arguments: {} });
assert.equal(readOverview.isError, undefined);
const denied = await readClient.callTool({ name: "create_tag", arguments: { name: "不应创建" } });
assert.equal(denied.isError, true);
const deniedPreview = await readClient.callTool({ name: "preview_delete_project", arguments: { projectId: project.id } });
assert.equal(deniedPreview.isError, true);

const secondSession = randomBytes(32).toString("base64url");
const secondUserId = randomUUID();
await pool.query("INSERT INTO users(id,email,created_at) VALUES($1,$2,NOW())", [secondUserId, "second@example.test"]);
await pool.query("INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,NOW()+INTERVAL '1 hour',NOW())", [randomUUID(), secondUserId, createHash("sha256").update(secondSession).digest("hex")]);
const secondPatResponse = await fetch(`${base}/api/mcp-tokens`, { method: "POST", headers: { authorization: `Bearer ${secondSession}`, "content-type": "application/json" }, body: JSON.stringify({ name: "second-user", scope: "write", expiresInDays: 30 }) });
assert.equal(secondPatResponse.status, 201);
const secondPat = await secondPatResponse.json();
const secondClient = await connect(secondPat.token);
const isolatedProjects = await secondClient.callTool({ name: "list_projects", arguments: {} });
assert.equal(isolatedProjects.structuredContent.items.length, 0);
const crossUserReference = await secondClient.callTool({ name: "create_task", arguments: { title: "越权引用", projectId: project.id } });
assert.equal(crossUserReference.isError, true);

const invalidOrigin = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${writePat.token}`, origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "bad-origin", version: "1" } } }) });
assert.equal(invalidOrigin.status, 403);

await secondClient.close();
await readClient.close();
await client.close();
const revokeResponse = await fetch(`${base}/api/mcp-tokens/${writePat.id}`, { method: "DELETE", headers: auth });
assert.equal(revokeResponse.status, 200);
const revokedResponse = await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${writePat.token}`, "content-type": "application/json" }, body: "{}" });
assert.equal(revokedResponse.status, 401);
const audits = await pool.query("SELECT tool_name,success FROM mcp_audit_logs WHERE user_id=$1", [login.user.id]);
assert.ok(audits.rowCount >= 10);
assert.ok(audits.rows.some((row) => row.tool_name === "delete_task" && row.success === true));
await pool.end();
console.log(`MCP integration passed with ${tools.tools.length} tools`);
