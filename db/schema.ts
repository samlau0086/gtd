import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const emailOtps = pgTable(
  "email_otps",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("email_otps_email_idx").on(table.email)],
);

export const authRateLimits = pgTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(1),
});

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#69d2c8"),
    backgroundColor: text("background_color").notNull().default("#173F3B"),
    textColor: text("text_color").notNull().default("#D9FFF9"),
    borderColor: text("border_color").notNull().default("#69D2C8"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("projects_user_idx").on(table.userId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    projectId: text("project_id"),
    parentTaskId: text("parent_task_id"),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("next"),
    context: text("context").notNull().default(""),
    important: boolean("important").notNull().default(false),
    startDate: text("start_date"),
    dueDate: text("due_date"),
    estimate: integer("estimate").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("tasks_user_idx").on(table.userId),
    index("tasks_project_idx").on(table.projectId),
  ],
);

export const tags = pgTable(
  "tags",
  { id: text("id").primaryKey(), userId: text("user_id").notNull(), name: text("name").notNull() },
  (table) => [index("tags_user_idx").on(table.userId)],
);

export const taskTags = pgTable(
  "task_tags",
  { taskId: text("task_id").notNull(), tagId: text("tag_id").notNull() },
  (table) => [primaryKey({ columns: [table.taskId, table.tagId] })],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: text("task_id").notNull(),
    dependsOnTaskId: text("depends_on_task_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
    index("dependencies_user_idx").on(table.userId),
  ],
);

export const aiConfigs = pgTable("ai_configs", {
  userId: text("user_id").primaryKey(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const notificationSettings = pgTable("notification_settings", {
  userId: text("user_id").primaryKey(),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  webhookUrl: text("webhook_url").notNull().default(""),
  encryptedWebhookSecret: text("encrypted_webhook_secret").notNull().default(""),
  barkEnabled: boolean("bark_enabled").notNull().default(false),
  barkBaseUrl: text("bark_base_url").notNull().default("https://api.day.app"),
  encryptedBarkKey: text("encrypted_bark_key").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone:true }).notNull(),
});

export const taskReminders = pgTable("task_reminders", {
  id:text("id").primaryKey(), userId:text("user_id").notNull(), taskId:text("task_id").notNull(),
  remindAt:timestamp("remind_at", { withTimezone:true }).notNull(), timezone:text("timezone").notNull(),
  channels:text("channels").array().notNull(), status:text("status").notNull().default("pending"),
  createdAt:timestamp("created_at", { withTimezone:true }).notNull(), updatedAt:timestamp("updated_at", { withTimezone:true }).notNull(),
}, (table) => [uniqueIndex("task_reminders_task_idx").on(table.taskId), index("task_reminders_due_idx").on(table.status,table.remindAt)]);

export const reminderDeliveries = pgTable("reminder_deliveries", {
  id:text("id").primaryKey(), reminderId:text("reminder_id").notNull(), channel:text("channel").notNull(),
  status:text("status").notNull().default("pending"), attempts:integer("attempts").notNull().default(0),
  nextAttemptAt:timestamp("next_attempt_at", { withTimezone:true }).notNull(), lockedAt:timestamp("locked_at", { withTimezone:true }),
  sentAt:timestamp("sent_at", { withTimezone:true }), lastError:text("last_error"),
  createdAt:timestamp("created_at", { withTimezone:true }).notNull(), updatedAt:timestamp("updated_at", { withTimezone:true }).notNull(),
}, (table) => [uniqueIndex("reminder_deliveries_reminder_channel_idx").on(table.reminderId,table.channel), index("reminder_deliveries_due_idx").on(table.status,table.nextAttemptAt)]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id:text("id").primaryKey(), userId:text("user_id").notNull(), endpoint:text("endpoint").notNull(),
  p256dh:text("p256dh").notNull(), auth:text("auth").notNull(), deviceName:text("device_name").notNull().default("浏览器设备"),
  userAgent:text("user_agent").notNull().default(""), enabled:boolean("enabled").notNull().default(true),
  createdAt:timestamp("created_at", { withTimezone:true }).notNull(), updatedAt:timestamp("updated_at", { withTimezone:true }).notNull(),
  lastSeenAt:timestamp("last_seen_at", { withTimezone:true }).notNull(),
}, (table) => [uniqueIndex("push_subscriptions_endpoint_idx").on(table.endpoint), index("push_subscriptions_user_idx").on(table.userId)]);
