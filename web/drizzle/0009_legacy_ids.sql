CREATE TABLE "legacy_ids" (
	"workspace_id" text NOT NULL,
	"collection" text NOT NULL,
	"legacy_id" text NOT NULL,
	"new_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_ids_workspace_id_collection_legacy_id_pk" PRIMARY KEY("workspace_id","collection","legacy_id")
);
--> statement-breakpoint
ALTER TABLE "legacy_ids" ADD CONSTRAINT "legacy_ids_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;