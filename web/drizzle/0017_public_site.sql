CREATE TABLE "public_rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"layout_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_services" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"photo_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_site" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"hero_title" text DEFAULT '' NOT NULL,
	"hero_intro" text DEFAULT '' NOT NULL,
	"guests_body" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gear" ADD COLUMN "public_show" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gear" ADD COLUMN "public_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gear" ADD COLUMN "public_qty" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "gear" ADD COLUMN "public_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gear" ADD COLUMN "public_room_id" text;--> statement-breakpoint
ALTER TABLE "gear" ADD COLUMN "public_group" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "public_rooms" ADD CONSTRAINT "public_rooms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_rooms" ADD CONSTRAINT "public_rooms_layout_id_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."layouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_services" ADD CONSTRAINT "public_services_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_site" ADD CONSTRAINT "public_site_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear" ADD CONSTRAINT "gear_public_room_id_public_rooms_id_fk" FOREIGN KEY ("public_room_id") REFERENCES "public"."public_rooms"("id") ON DELETE set null ON UPDATE no action;