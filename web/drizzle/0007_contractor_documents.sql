ALTER TABLE "contractors" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scopes_of_work" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;