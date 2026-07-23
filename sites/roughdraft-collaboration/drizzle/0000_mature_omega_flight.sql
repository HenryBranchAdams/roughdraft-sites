CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`markdown_path` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_document_path_unique` ON `assets` (`document_id`,`markdown_path`);--> statement-breakpoint
CREATE INDEX `assets_document_created_idx` ON `assets` (`document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`markdown` text NOT NULL,
	`author_email` text NOT NULL,
	`author_name` text,
	`change_kind` text DEFAULT 'edit' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_versions_document_version_unique` ON `document_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE INDEX `document_versions_document_created_idx` ON `document_versions` (`document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`markdown` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`review_state` text DEFAULT 'in_review' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_slug_unique` ON `documents` (`slug`);--> statement-breakpoint
CREATE INDEX `documents_updated_at_idx` ON `documents` (`updated_at`);--> statement-breakpoint
CREATE TABLE `review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`reviewer_email` text NOT NULL,
	`reviewer_name` text,
	`overall_comment` text,
	`summary_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_events_document_created_idx` ON `review_events` (`document_id`,`created_at`);