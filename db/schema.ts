import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), name: text("name").notNull(),
  color: text("color").notNull().default("#69d2c8"), createdAt: integer("created_at").notNull(),
}, (table) => [index("projects_user_idx").on(table.userId)]);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), projectId: text("project_id"), parentTaskId: text("parent_task_id"),
  title: text("title").notNull(), notes: text("notes").notNull().default(""), status: text("status").notNull().default("next"),
  context: text("context").notNull().default(""), important: integer("important", { mode: "boolean" }).notNull().default(false),
  startDate: text("start_date"), dueDate: text("due_date"), estimate: integer("estimate").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, (table) => [index("tasks_user_idx").on(table.userId), index("tasks_project_idx").on(table.projectId)]);

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), name: text("name").notNull(),
}, (table) => [index("tags_user_idx").on(table.userId)]);

export const taskTags = sqliteTable("task_tags", {
  taskId: text("task_id").notNull(), tagId: text("tag_id").notNull(),
}, (table) => [primaryKey({ columns: [table.taskId, table.tagId] })]);

export const taskDependencies = sqliteTable("task_dependencies", {
  taskId: text("task_id").notNull(), dependsOnTaskId: text("depends_on_task_id").notNull(), userId: text("user_id").notNull(),
}, (table) => [primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }), index("dependencies_user_idx").on(table.userId)]);

export const aiConfigs = sqliteTable("ai_configs", {
  userId: text("user_id").primaryKey(), baseUrl: text("base_url").notNull(), model: text("model").notNull(),
  encryptedKey: text("encrypted_key").notNull(), updatedAt: integer("updated_at").notNull(),
});
