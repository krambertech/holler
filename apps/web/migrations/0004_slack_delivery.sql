ALTER TABLE `hollers` ADD `close_queued_at` integer;--> statement-breakpoint
ALTER TABLE `hollers` ADD `reminded_at` integer;--> statement-breakpoint
ALTER TABLE `recipients` ADD `next_reminder_at` integer;--> statement-breakpoint
CREATE INDEX `recipients_next_reminder` ON `recipients` (`next_reminder_at`);