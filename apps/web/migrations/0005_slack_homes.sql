CREATE TABLE `slack_homes` (
	`workspace_id` text NOT NULL,
	`slack_user_id` text NOT NULL,
	`opened_at` integer NOT NULL,
	`queued_at` integer,
	`published_at` integer,
	PRIMARY KEY(`workspace_id`, `slack_user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
