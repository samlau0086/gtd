import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the GTD Flow product shell", async () => {
  const [page, app, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), readFile(new URL("../app/GTDApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"), readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<GTDApp/); assert.match(layout, /GTD Flow/); assert.match(app, /今天/); assert.match(app, /甘特/); assert.match(app, /AI 智能拆分/);
  assert.doesNotMatch(`${page}${layout}${packageJson}`, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("ships durable data, auth and AI security boundaries", async () => {
  const [hosting, migration, auth, crypto, ai, state] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"), readFile(new URL("../drizzle/0000_unique_bulldozer.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/auth.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/_lib/crypto.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/decompose/route.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"d1": "DB"/); assert.match(migration, /CREATE TABLE `tasks`/); assert.match(migration, /CREATE TABLE `task_dependencies`/);
  assert.match(auth, /\/auth\/v1\/user/); assert.match(crypto, /AES-GCM/); assert.match(crypto, /privateHost/); assert.match(ai, /chat\/completions/); assert.match(state, /WHERE user_id = \?/); assert.match(state, /DB\.batch/);
});
