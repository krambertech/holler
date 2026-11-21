CREATE TABLE `directory_syncs` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`run_started_at` integer,
	`cursor` text,
	`completed_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
