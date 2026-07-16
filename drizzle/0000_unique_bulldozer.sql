CREATE TABLE `ai_configs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`encrypted_key` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#69d2c8' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_user_idx` ON `projects` (`user_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tags_user_idx` ON `tags` (`user_id`);--> statement-breakpoint
CREATE TABLE `task_dependencies` (
	`task_id` text NOT NULL,
	`depends_on_task_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `depends_on_task_id`)
);
--> statement-breakpoint
CREATE INDEX `dependencies_user_idx` ON `task_dependencies` (`user_id`);--> statement-breakpoint
CREATE TABLE `task_tags` (
	`task_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `tag_id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text,
	`parent_task_id` text,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'next' NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`important` integer DEFAULT false NOT NULL,
	`start_date` text,
	`due_date` text,
	`estimate` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_user_idx` ON `tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);