CREATE TABLE `response_owners` (
	`response_id` text PRIMARY KEY NOT NULL,
	`holler_id` text NOT NULL,
	`slack_user_id` text NOT NULL,
	FOREIGN KEY (`response_id`) REFERENCES `responses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`holler_id`) REFERENCES `hollers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `response_owners_one_per_person` ON `response_owners` (`holler_id`,`slack_user_id`);--> statement-breakpoint
CREATE INDEX `response_owners_person` ON `response_owners` (`slack_user_id`);