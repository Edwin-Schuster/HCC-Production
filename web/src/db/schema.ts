import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const memberRole = pgEnum("member_role", ["admin", "editor", "viewer"]);
export const folderVisibility = pgEnum("folder_visibility", ["public", "members", "editors"]);
export const sopStatus = pgEnum("sop_status", ["draft", "in_review", "approved", "published", "retired"]);

// ---------- Identity (ported HCC login) ----------

export const users = pgTable("users", {
  id: id(),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  passwordHash: text("password_hash"),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------- Workspace ----------

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("viewer"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const folders = pgTable(
  "folders",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnyPgColumn => folders.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    codePrefix: varchar("code_prefix", { length: 12 }).notNull(),
    visibility: folderVisibility("visibility").notNull().default("members"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("folders_workspace_idx").on(t.workspaceId, t.parentId)],
);

/** Next number per document-code prefix, e.g. SOP-AUD-007. */
export const docCodeCounters = pgTable(
  "doc_code_counters",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    prefix: varchar("prefix", { length: 12 }).notNull(),
    nextValue: integer("next_value").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.prefix] })],
);

/** Production roles a step can be assigned to (Technical Director, A1, ...). */
export const teamRoles = pgTable("team_roles", {
  id: id(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const templates = pgTable(
  "templates",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    blocks: jsonb("blocks").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("templates_key_idx").on(t.workspaceId, t.key)],
);

// ---------- SOPs ----------

export const sops = pgTable(
  "sops",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentCode: text("document_code").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    status: sopStatus("status").notNull().default("draft"),
    reviewIntervalDays: integer("review_interval_days").notNull().default(365),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    folderId: text("folder_id")
      .notNull()
      .references(() => folders.id),
    templateId: text("template_id").references(() => templates.id, { onDelete: "set null" }),
    currentVersionId: text("current_version_id").references((): AnyPgColumn => sopVersions.id),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Document code + tags, kept in sync by the service layer (array_to_string is not immutable). */
    searchKeywords: text("search_keywords").notNull().default(""),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english'::regconfig, ${sops.title}), 'A') || setweight(to_tsvector('english'::regconfig, ${sops.searchKeywords}), 'B') || setweight(to_tsvector('english'::regconfig, ${sops.summary}), 'C')`,
    ),
  },
  (t) => [
    uniqueIndex("sops_code_idx").on(t.workspaceId, t.documentCode),
    index("sops_folder_idx").on(t.folderId),
    index("sops_search_idx").using("gin", t.searchVector),
  ],
);

/** A draft (published_at is null) or an immutable published version. */
export const sopVersions = pgTable(
  "sop_versions",
  {
    id: id(),
    sopId: text("sop_id")
      .notNull()
      .references((): AnyPgColumn => sops.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: text("published_by").references(() => users.id),
    changeSummary: text("change_summary"),
    approvedBy: jsonb("approved_by").$type<{ userId: string; approvedAt: string }[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => users.id),
  },
  (t) => [
    uniqueIndex("sop_versions_number_idx").on(t.sopId, t.versionNumber),
    uniqueIndex("sop_versions_one_draft_idx").on(t.sopId).where(sql`${t.publishedAt} is null`),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    id: id(),
    versionId: text("version_id")
      .notNull()
      .references(() => sopVersions.id, { onDelete: "cascade" }),
    /** Stable identity of a block across versions (for diffs, feedback and runs). */
    key: text("key").notNull(),
    parentId: text("parent_id"),
    position: integer("position").notNull(),
    type: text("type").notNull(),
    content: jsonb("content").notNull(),
    roleId: text("role_id"),
    estDuration: integer("est_duration"),
    expectedResult: text("expected_result"),
    warning: text("warning"),
    media: jsonb("media").notNull().default([]),
    branchRules: jsonb("branch_rules"),
    searchText: text("search_text").notNull().default(""),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english'::regconfig, ${blocks.searchText})`,
    ),
  },
  (t) => [
    index("blocks_version_idx").on(t.versionId, t.parentId, t.position),
    index("blocks_search_idx").using("gin", t.searchVector),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_target_idx").on(t.targetType, t.targetId)],
);
