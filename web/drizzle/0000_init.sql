CREATE TYPE "public"."folder_visibility" AS ENUM('public', 'members', 'editors');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."sop_status" AS ENUM('draft', 'in_review', 'approved', 'published', 'retired');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"version_id" text NOT NULL,
	"key" text NOT NULL,
	"parent_id" text,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"content" jsonb NOT NULL,
	"role_id" text,
	"est_duration" integer,
	"expected_result" text,
	"warning" text,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"branch_rules" jsonb,
	"search_text" text DEFAULT '' NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, "blocks"."search_text")) STORED
);
--> statement-breakpoint
CREATE TABLE "doc_code_counters" (
	"workspace_id" text NOT NULL,
	"prefix" varchar(12) NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "doc_code_counters_workspace_id_prefix_pk" PRIMARY KEY("workspace_id","prefix")
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"code_prefix" varchar(12) NOT NULL,
	"visibility" "folder_visibility" DEFAULT 'members' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sop_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"sop_id" text NOT NULL,
	"version_number" integer,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"change_summary" text,
	"approved_by" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "sops" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"document_code" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"owner_id" text NOT NULL,
	"status" "sop_status" DEFAULT 'draft' NOT NULL,
	"review_interval_days" integer DEFAULT 365 NOT NULL,
	"next_review_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"folder_id" text NOT NULL,
	"template_id" text,
	"current_version_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_keywords" text DEFAULT '' NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english'::regconfig, "sops"."title"), 'A') || setweight(to_tsvector('english'::regconfig, "sops"."search_keywords"), 'B') || setweight(to_tsvector('english'::regconfig, "sops"."summary"), 'C')) STORED
);
--> statement-breakpoint
CREATE TABLE "team_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"blocks" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"password_hash" text,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_version_id_sop_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."sop_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_code_counters" ADD CONSTRAINT "doc_code_counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_versions" ADD CONSTRAINT "sop_versions_sop_id_sops_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."sops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_versions" ADD CONSTRAINT "sop_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_versions" ADD CONSTRAINT "sop_versions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_current_version_id_sop_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."sop_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sops" ADD CONSTRAINT "sops_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_roles" ADD CONSTRAINT "team_roles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "blocks_version_idx" ON "blocks" USING btree ("version_id","parent_id","position");--> statement-breakpoint
CREATE INDEX "blocks_search_idx" ON "blocks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "folders_workspace_idx" ON "folders" USING btree ("workspace_id","parent_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sop_versions_number_idx" ON "sop_versions" USING btree ("sop_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "sop_versions_one_draft_idx" ON "sop_versions" USING btree ("sop_id") WHERE "sop_versions"."published_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sops_code_idx" ON "sops" USING btree ("workspace_id","document_code");--> statement-breakpoint
CREATE INDEX "sops_folder_idx" ON "sops" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "sops_search_idx" ON "sops" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_key_idx" ON "templates" USING btree ("workspace_id","key");