PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_viewers` (
	`holler_id` text NOT NULL,
	`slack_user_id` text NOT NULL,
	`added_by_id` text NOT NULL,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`notified_at` integer,
	PRIMARY KEY(`holler_id`, `slack_user_id`),
	FOREIGN KEY (`holler_id`) REFERENCES `hollers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- No rows are copied: nothing wrote viewers before this migration, and member_id has no slack_user_id to carry over.
DROP TABLE `viewers`;--> statement-breakpoint
ALTER TABLE `__new_viewers` RENAME TO `viewers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `viewers_slack_user` ON `viewers` (`slack_user_id`);--> statement-breakpoint
CREATE INDEX `viewers_unnotified` ON `viewers` (`notified_at`);