import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the GTD Flow product shell", async () => {
  const [page, app, layout, packageJson, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/GTDApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<GTDApp/);
  assert.match(page, /<PWAInstall/);
  assert.match(layout, /GTD Flow/);
  assert.match(app, /今天/);
  assert.match(app, /key: "important", icon: "star", label: "重要"/);
  assert.match(app, /task\.important \? "★" : "☆"/);
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
  assert.match(app, /function FriendlyDialog/);
  assert.match(app, /function ToastStack/);
  assert.match(app, /function TaskContextMenu/);
  assert.match(app, /deleteTaskWithConfirmation/);
  assert.match(app, /task-swipe-delete/);
  assert.match(app, /onSwipeOpen/);
  assert.match(app, /editProject/);
  assert.match(app, /deleteProjectWithConfirmation/);
  assert.match(app, /编辑项目/);
  assert.match(app, /删除项目/);
  assert.match(app, /onContextMenu/);
  assert.match(app, /beginCreateRange/);
  assert.match(app, /onDoubleClick/);
  assert.match(app, /gantt-date-tooltip/);
  assert.match(app, /isMobileGanttViewport/);
  assert.match(app, /gantt-mobile-hint/);
  const desktopDetailStyles = styles.slice(
    styles.indexOf("/* Detail panel */"),
    styles.indexOf("@media (max-width: 1180px)"),
  );
  assert.match(desktopDetailStyles, /\.detail > \*\s*{\s*flex-shrink: 0/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(app, /createGanttTask/);
  assert.doesNotMatch(app, /\b(?:alert|confirm|prompt)\s*\(/);
  assert.doesNotMatch(app, /<select/);
  assert.doesNotMatch(
    `${page}${layout}${packageJson}`,
    /codex-preview|Your site is taking shape|react-loading-skeleton/,
  );
});

test("ships project theme settings across task views", async () => {
  const [app, styles, migration] = await Promise.all([
    readFile(new URL("../app/GTDApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../postgres/migrations/007_project_theme_colors.sql", import.meta.url), "utf8"),
  ]);
  assert.match(app, /function ProjectEditorDialog/);
  assert.match(app, /更多设置/);
  assert.match(app, /backgroundColor/);
  assert.match(app, /textColor/);
  assert.match(app, /borderColor/);
  assert.ok((app.match(/backgroundColor: "#/g) || []).length >= 10);
  assert.match(styles, /task-row\.project-themed/);
  assert.match(styles, /project-theme-presets/);
  assert.match(migration, /background_color/);
  assert.match(migration, /text_color/);
  assert.match(migration, /border_color/);
});

test("ships an installable Chrome app experience", async () => {
  const [manifest, installer, worker, offline, app] = await Promise.all([
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/PWAInstall.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../public/offline.html", import.meta.url), "utf8"),
    readFile(new URL("../app/GTDApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-maskable-512\.png/);
  assert.match(manifest, /shortcuts/);
  assert.doesNotMatch(installer, /beforeinstallprompt/);
  assert.match(installer, /return null/);
  assert.match(installer, /serviceWorker\.register/);
  assert.match(worker, /event\.request\.mode !== "navigate"/);
  assert.match(worker, /offline\.html/);
  assert.match(worker, /notificationclick/);
  assert.match(worker, /showNotification/);
  assert.match(offline, /重新连接/);
  assert.match(app, /setAppBadge\?\.\(dueTodayCount\)/);
  assert.match(app, /activeTasks\.filter\(\(task\) => task\.status !== "done" && task\.dueDate === today\(\)\)/);
  assert.match(app, /clearAppBadge/);
  assert.match(app, /window\.gtdDesktop\?\.syncTasks\(activeTasks\)/);
});

test("ships reliable multi-channel task reminders", async () => {
  const [app, migration, notifications, delivery, worker, compose] = await Promise.all([
    readFile(new URL("../app/GTDApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../postgres/migrations/006_task_reminders.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/notifications.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/notification-delivery.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/reminders.ts", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.prod.yml", import.meta.url), "utf8"),
  ]);
  assert.match(app, /function ReminderEditor/);
  assert.match(app, /今天晚些时候/);
  assert.match(app, /通知与提醒/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS task_reminders/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS reminder_deliveries/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS push_subscriptions/);
  assert.match(notifications, /localDateTimeToUtc/);
  assert.match(delivery, /X-GTD-Signature/);
  assert.match(delivery, /redirect:"manual"/);
  assert.match(worker, /SKIP LOCKED/);
  assert.match(worker, /INTERVAL '15 minutes'/);
  assert.match(compose, /reminder-worker/);
});

test("ships PostgreSQL, self-hosted auth and AI security boundaries", async () => {
  const [compose, dockerfile, migration, vectorMigration, health, auth, otp, crypto, ai, aiTasks, aiTest, state] = await Promise.all([
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
    readFile(new URL("../app/api/_lib/ai-tasks.ts", import.meta.url), "utf8"),
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
  assert.match(ai, /decomposeTaskWithAi/);
  assert.match(aiTasks, /chat\/completions/);
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

test("supports encrypted SMTP and Resend email providers", async () => {
  const [app, mail, config, migration] = await Promise.all([
    readFile(new URL("../app/GTDApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/mail.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/mail/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../postgres/migrations/004_email_providers.sql", import.meta.url), "utf8"),
  ]);
  assert.match(app, /Resend API/);
  assert.match(app, /api\/admin\/mail/);
  assert.match(mail, /Authorization: `Bearer/);
  assert.match(mail, /Idempotency-Key/);
  assert.match(mail, /assertPublicEndpoint/);
  assert.match(config, /encryptSecret/);
  assert.match(config, /existing\.rows\[0\]\?\.provider === provider/);
  assert.doesNotMatch(config, /decryptSecret/);
  assert.match(migration, /provider IN \('smtp', 'resend'\)/);
});

test("ships authenticated MCP tools without exposing system settings", async () => {
  const [server, auth, route, migration, app] = await Promise.all([
    readFile(new URL("../app/api/_lib/mcp-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/_lib/mcp-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/mcp/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../postgres/migrations/005_mcp_and_revisions.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/GTDApp.tsx", import.meta.url), "utf8"),
  ]);
  for (const tool of ["get_gtd_overview", "list_tasks", "create_task", "set_task_dependencies", "decompose_task_with_ai", "commit_task_decomposition"]) assert.match(server, new RegExp(`"${tool}"`));
  assert.match(server, /registerDeleteTools\(server,principal,"task"\)/);
  assert.match(server, /preview_delete_\$\{type\}/);
  assert.match(server, /gtd:\/\/overview/);
  assert.match(server, /gtd:\/\/views\/\{view\}/);
  assert.match(server, /weekly_review/);
  assert.match(server, /plan_my_day/);
  assert.doesNotMatch(server, /registerTool\("(?:smtp|mail|ai_config|mcp_token|account|preferences)/);
  assert.match(auth, /createHmac\("sha256"/);
  assert.match(auth, /120/);
  assert.match(route, /WebStandardStreamableHTTPServerTransport/);
  assert.match(route, /Invalid origin/);
  assert.match(migration, /mcp_delete_confirmations/);
  assert.match(migration, /mcp_audit_logs/);
  assert.match(app, /仅显示这一次/);
  assert.match(app, /window\.setInterval/);
  assert.match(app, /5000/);
});

test("keeps AI decomposition sort orders within PostgreSQL INTEGER range", async () => {
  const source = await readFile(
    new URL("../app/api/_lib/ai-tasks.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /Date\.now\(\)\s*\+\s*index/);
  assert.match(source, /MAX\(sort_order::BIGINT\)/);
  assert.match(source, /nextSortOrder\+index/);
});
