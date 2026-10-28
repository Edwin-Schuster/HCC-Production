ALTER TABLE "project_photos" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_photos" ADD COLUMN "mime" text DEFAULT 'image/jpeg' NOT NULL;