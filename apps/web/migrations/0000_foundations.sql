CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`via` text NOT NULL,
	`member_id` text,
	`credential_id` text,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`data` text,
	`at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_workspace_at` ON `activity` (`workspace_id`,`at`);--> statement-breakpoint
CREATE INDEX `activity_subject` ON `activity` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE TABLE `slack_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `apikey` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text DEFAULT 'default' NOT NULL,
	`name` text,
	`start` text,
	`reference_id` text NOT NULL,
	`prefix` text,
	`key` text NOT NULL,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` integer,
	`enabled` integer DEFAULT true,
	`rate_limit_enabled` integer DEFAULT true,
	`rate_limit_time_window` integer DEFAULT 60000,
	`rate_limit_max` integer DEFAULT 600,
	`request_count` integer DEFAULT 0,
	`remaining` integer,
	`last_request` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`permissions` text,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `apikey_configId_idx` ON `apikey` (`config_id`);--> statement-breakpoint
CREATE INDEX `apikey_referenceId_idx` ON `apikey` (`reference_id`);--> statement-breakpoint
CREATE INDEX `apikey_key_idx` ON `apikey` (`key`);--> statement-breakpoint
CREATE TABLE `jwks` (
	`id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`alg` text,
	`crv` text
);
--> statement-breakpoint
CREATE TABLE `oauth_access_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`refresh_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refresh_id`) REFERENCES `oauth_refresh_token`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_access_token_token_unique` ON `oauth_access_token` (`token`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_clientId_idx` ON `oauth_access_token` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_sessionId_idx` ON `oauth_access_token` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_userId_idx` ON `oauth_access_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_authorizationCodeId_idx` ON `oauth_access_token` (`authorization_code_id`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_refreshId_idx` ON `oauth_access_token` (`refresh_id`);--> statement-breakpoint
CREATE TABLE `oauth_client` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text,
	`client_discovery_id` text,
	`disabled` integer DEFAULT false,
	`skip_consent` integer,
	`enable_end_session` integer,
	`subject_type` text,
	`scopes` text,
	`client_credentials_scopes` text DEFAULT '[]',
	`user_id` text,
	`created_at` integer,
	`updated_at` integer,
	`name` text,
	`uri` text,
	`icon` text,
	`contacts` text,
	`tos` text,
	`policy` text,
	`software_id` text,
	`software_version` text,
	`software_statement` text,
	`redirect_uris` text NOT NULL,
	`post_logout_redirect_uris` text,
	`backchannel_logout_uri` text,
	`backchannel_logout_session_required` integer,
	`token_endpoint_auth_method` text,
	`application_type` text,
	`jwks` text,
	`jwks_uri` text,
	`grant_types` text,
	`response_types` text,
	`require_pkce` integer,
	`dpop_bound_access_tokens` integer DEFAULT false,
	`reference_id` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_client_client_id_unique` ON `oauth_client` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthClient_userId_idx` ON `oauth_client` (`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_client_assertion` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_client_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata` text,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `oauth_resource`(`identifier`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthClientResource_clientId_resourceId_uidx` ON `oauth_client_resource` (`client_id`,`resource_id`);--> statement-breakpoint
CREATE INDEX `oauthClientResource_clientId_idx` ON `oauth_client_resource` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthClientResource_resourceId_idx` ON `oauth_client_resource` (`resource_id`);--> statement-breakpoint
CREATE TABLE `oauth_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text,
	`reference_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauthConsent_clientId_idx` ON `oauth_consent` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthConsent_userId_idx` ON `oauth_consent` (`user_id`);--> statement-breakpoint
CREATE TABLE `oauth_refresh_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`reference_id` text,
	`authorization_code_id` text,
	`resources` text,
	`requested_user_info_claims` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`rotated_at` integer,
	`rotation_replay_response` text,
	`rotation_replay_expires_at` integer,
	`auth_time` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_refresh_token_token_unique` ON `oauth_refresh_token` (`token`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_clientId_idx` ON `oauth_refresh_token` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_sessionId_idx` ON `oauth_refresh_token` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_userId_idx` ON `oauth_refresh_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_authorizationCodeId_idx` ON `oauth_refresh_token` (`authorization_code_id`);--> statement-breakpoint
CREATE TABLE `oauth_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`access_token_ttl` integer,
	`refresh_token_ttl` integer,
	`signing_algorithm` text,
	`signing_key_id` text,
	`allowed_scopes` text,
	`custom_claims` text,
	`dpop_bound_access_tokens_required` integer DEFAULT false,
	`disabled` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer,
	`policy_version` integer DEFAULT 1,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_resource_identifier_unique` ON `oauth_resource` (`identifier`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `hollers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`search_title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`external_url` text,
	`anonymous` integer DEFAULT false NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`audience` text DEFAULT '{"people":[],"groups":[],"everyone":false}' NOT NULL,
	`announce_channel_id` text,
	`announce_ts` text,
	`send_at` integer,
	`send_in_recipient_time_zone` integer DEFAULT false NOT NULL,
	`sent_at` integer,
	`close_after_hours` integer DEFAULT 72 NOT NULL,
	`closes_at` integer,
	`closed_at` integer,
	`reminders_enabled` integer DEFAULT true NOT NULL,
	`report_token` text,
	`created_via` text NOT NULL,
	`idempotency_key` text,
	`repeat_of_id` text,
	`repeat_rule` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hollers_workspace_status` ON `hollers` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `hollers_creator` ON `hollers` (`creator_id`);--> statement-breakpoint
CREATE INDEX `hollers_send_at` ON `hollers` (`status`,`send_at`);--> statement-breakpoint
CREATE INDEX `hollers_closes_at` ON `hollers` (`status`,`closes_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `hollers_report_token` ON `hollers` (`report_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `hollers_idempotency` ON `hollers` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `options` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`position` integer NOT NULL,
	`label` text NOT NULL,
	`score` integer,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `options_question` ON `options` (`question_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `options_question_id` ON `options` (`question_id`,`id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`holler_id` text NOT NULL,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`style` text DEFAULT 'plain' NOT NULL,
	`prompt` text NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`holler_id`) REFERENCES `hollers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `questions_holler` ON `questions` (`holler_id`,`position`);--> statement-breakpoint
CREATE TABLE `recipients` (
	`holler_id` text NOT NULL,
	`slack_user_id` text NOT NULL,
	`added_via` text NOT NULL,
	`send_at` integer,
	`invited_at` integer,
	`dm_channel_id` text,
	`dm_ts` text,
	`answered_at` integer,
	`reminders_sent` integer DEFAULT 0 NOT NULL,
	`last_reminded_at` integer,
	`snoozed_until` integer,
	`failure` text,
	PRIMARY KEY(`holler_id`, `slack_user_id`),
	FOREIGN KEY (`holler_id`) REFERENCES `hollers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipients_due` ON `recipients` (`invited_at`,`send_at`);--> statement-breakpoint
CREATE INDEX `recipients_waiting` ON `recipients` (`holler_id`,`answered_at`);--> statement-breakpoint
CREATE TABLE `viewers` (
	`holler_id` text NOT NULL,
	`member_id` text NOT NULL,
	`added_by_id` text NOT NULL,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`notified_at` integer,
	PRIMARY KEY(`holler_id`, `member_id`),
	FOREIGN KEY (`holler_id`) REFERENCES `hollers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`response_id` text NOT NULL,
	`question_id` text NOT NULL,
	`option_id` text,
	`text` text,
	FOREIGN KEY (`response_id`) REFERENCES `responses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`,`option_id`) REFERENCES `options`(`question_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "answers_one_value" CHECK(("answers"."option_id" is null) <> ("answers"."text" is null))
);
--> statement-breakpoint
CREATE INDEX `answers_response` ON `answers` (`response_id`);--> statement-breakpoint
CREATE INDEX `answers_question` ON `answers` (`question_id`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`holler_id` text NOT NULL,
	`slack_user_id` text,
	`submitted_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`via` text NOT NULL,
	FOREIGN KEY (`holler_id`) REFERENCES `hollers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `responses_holler` ON `responses` (`holler_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `responses_one_per_person` ON `responses` (`holler_id`,`slack_user_id`) WHERE "responses"."slack_user_id" is not null;--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`slack_user_id` text NOT NULL,
	`role` text DEFAULT 'sender' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_workspace_slack_user` ON `members` (`workspace_id`,`slack_user_id`);--> statement-breakpoint
CREATE INDEX `members_user` ON `members` (`user_id`);--> statement-breakpoint
CREATE TABLE `slack_groups` (
	`workspace_id` text NOT NULL,
	`slack_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`handle` text,
	`member_count` integer,
	`search_name` text NOT NULL,
	`refreshed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`workspace_id`, `slack_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `slack_installations` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`bot_user_id` text NOT NULL,
	`bot_token_ciphertext` text NOT NULL,
	`scopes` text NOT NULL,
	`installed_by_slack_user_id` text NOT NULL,
	`installed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `slack_people` (
	`workspace_id` text NOT NULL,
	`slack_user_id` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text,
	`email` text,
	`avatar_url` text,
	`time_zone` text,
	`is_bot` integer DEFAULT false NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`search_name` text NOT NULL,
	`refreshed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`workspace_id`, `slack_user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `slack_people_search` ON `slack_people` (`workspace_id`,`search_name`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`slack_team_id` text NOT NULL,
	`slack_enterprise_id` text,
	`name` text NOT NULL,
	`slack_domain` text,
	`icon_url` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`polar_customer_id` text,
	`polar_subscription_id` text,
	`plan_ends_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`uninstalled_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slack_team` ON `workspaces` (`slack_team_id`);