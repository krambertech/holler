CREATE TABLE `answer_notes` (
	`response_id` text NOT NULL,
	`question_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	PRIMARY KEY(`response_id`, `question_id`, `kind`),
	FOREIGN KEY (`response_id`) REFERENCES `responses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `answer_notes_question` ON `answer_notes` (`question_id`);--> statement-breakpoint
ALTER TABLE `options` ADD `is_other` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` ADD `max_choices` integer;--> statement-breakpoint
ALTER TABLE `questions` ADD `follow_up_prompt` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `follow_up_when` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `low_label` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `high_label` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `number_min` integer;--> statement-breakpoint
ALTER TABLE `questions` ADD `number_max` integer;