import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the GTD Flow product shell", async () => {
  const [page, app, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/GTDApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<GTDApp/);
  assert.match(layout, /GTD Flow/);
  assert.match(app, /今天/);
  assert.match(app, /甘特/);
  assert.match(app, /AI 智能拆分/);
  assert.match(app, /function SelectPopover/);
  assert.match(app, /aria-haspopup="listbox"/);
  assert.match(app, /aria-multiselectable/);
  assert.match(app, /allowCreate/);
  assert.match(app, /创建新的任务情境/);
  assert.match(app, /创建新的任务标签/);
  assert.match(app, /执行步骤/);
  assert.match(app, /removeTaskTree/);
  assert.doesNotMatch(app, /<select/);
  assert.doesNotMatch(
    `${page}${layout}${packageJson}`,
    /codex-preview|Your site is taking shape|react-loading-skeleton/,
  );
});

test("ships PostgreSQL, self-hosted auth and AI security boundaries", async () => {
  const [compose, dockerfile, migration, vectorMigration, health, auth, otp, crypto, ai, aiTest, state] = await Promise.all([
    readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(
      new URL("../postgres/migrations/001_init.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../postgres/migrations/002_enable_vector.sql", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/verify-otp/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/crypto.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/ai/decompose/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/ai/config/test/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(compose, /pgvector\/pgvector:pg16/);
  assert.match(compose, /Caddyfile/);
  assert.match(dockerfile, /node scripts\/migrate\.mjs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS tasks/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS task_dependencies/);
  assert.match(vectorMigration, /CREATE EXTENSION IF NOT EXISTS vector/);
  assert.match(health, /pg_extension/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS sessions/);
  assert.match(auth, /token_hash/);
  assert.match(otp, /timingSafeEqual/);
  assert.match(otp, /INTERVAL '30 days'/);
  assert.match(crypto, /AES-GCM/);
  assert.match(crypto, /privateHost/);
  assert.match(crypto, /assertPublicEndpoint/);
  assert.match(ai, /chat\/completions/);
  assert.match(aiTest, /chat\/completions/);
  assert.match(aiTest, /requireUser/);
  assert.match(aiTest, /15000/);
  assert.doesNotMatch(aiTest, /Response\.json\([^)]*apiKey/);
  assert.match(state, /WHERE user_id=\$1/);
  assert.match(state, /withTransaction/);
});

test("ships guarded GitHub Actions deployment to VPS", async () => {
  const [workflow, compose] = await Promise.all([
    readFile(new URL("../.github/workflows/deploy-vps.yml", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.prod.yml", import.meta.url), "utf8"),
  ]);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /docker\/build-push-action@v7/);
  assert.match(workflow, /StrictHostKeyChecking=yes/);
  assert.match(workflow, /VPS_HOST_KEY/);
  assert.match(workflow, /\.env\.previous/);
  assert.match(workflow, /api\/health/);
  assert.doesNotMatch(workflow, /ssh-keyscan/);
  assert.match(compose, /name: gtd-flow/);
  assert.match(compose, /gtd-flow-postgres/);
  assert.match(compose, /pgvector\/pgvector:pg16/);
  assert.match(compose, /APP_IMAGE/);
});
