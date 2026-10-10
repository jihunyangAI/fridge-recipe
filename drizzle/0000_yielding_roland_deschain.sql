CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`allergies` text DEFAULT '[]' NOT NULL,
	`disliked_ingredients` text DEFAULT '[]' NOT NULL,
	`diet_type` text DEFAULT '일반' NOT NULL,
	`default_servings` integer DEFAULT 2 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `saved_recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`title` text NOT NULL,
	`cuisine` text,
	`recipe_json` text NOT NULL,
	`source_ingredients` text NOT NULL,
	`memo` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_recipes_user_recipe` ON `saved_recipes` (`user_id`,`recipe_id`);--> statement-breakpoint
CREATE INDEX `saved_recipes_user_created` ON `saved_recipes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);