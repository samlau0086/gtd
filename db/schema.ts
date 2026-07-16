import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
