ALTER TABLE `recipients` ADD `next_reminder_at` integer;--> statement-breakpoint
CREATE INDEX `recipients_next_reminder` ON `recipients` (`next_reminder_at`);