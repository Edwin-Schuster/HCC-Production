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
export const approvalDecision = pgEnum("approval_decision", ["approved", "changes_requested"]);
export const feedbackType = pgEnum("feedback_type", ["unclear", "wrong", "other"]);
export const feedbackStatus = pgEnum("feedback_status", ["open", "accepted", "rejected"]);
export const suggestionStatus = pgEnum("suggestion_status", ["pending", "accepted", "rejected"]);
export const runStatus = pgEnum("run_status", ["in_progress", "completed", "abandoned"]);
export const apiKeyRole = pgEnum("api_key_role", ["viewer", "editor"]);
export const deliveryStatus = pgEnum("delivery_status", ["pending", "success", "failed"]);
export const viewSource = pgEnum("view_source", ["app", "share", "embed", "api", "extension"]);

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

export type Branding = {
  logoUrl?: string | null;
  primaryColor?: string | null;
  font?: "default" | "serif" | "system" | null;
  headerText?: string | null;
  footerText?: string | null;
};

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  branding: jsonb("branding").$type<Branding>().notNull().default({}),
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
    /** Approvals a draft needs before it can be published. 0 = editors publish directly. */
    requiredApprovals: integer("required_approvals").notNull().default(0),
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
    /** Web pages this SOP is about (e.g. "studio.youtube.com/*"); the browser extension suggests it there. */
    urlPatterns: text("url_patterns").array().notNull().default(sql`'{}'::text[]`),
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
    /** Set while a draft waits for approval. */
    reviewRequestedAt: timestamp("review_requested_at", { withTimezone: true }),
    reviewRequestedBy: text("review_requested_by").references(() => users.id),
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

/** Uploaded files (SOP images). Bytes live in the storage adapter (local disk or S3-compatible). */
export const files = pgTable("files", {
  id: id(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key").notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// ---------- Phase 2: collaboration and governance ----------

/** An approver's decision on a draft. Only counts while the draft is unchanged since (draftUpdatedAt). */
export const sopApprovals = pgTable(
  "sop_approvals",
  {
    id: id(),
    sopId: text("sop_id")
      .notNull()
      .references(() => sops.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => sopVersions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    decision: approvalDecision("decision").notNull(),
    comment: text("comment").notNull().default(""),
    draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sop_approvals_version_idx").on(t.versionId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link").notNull().default(""),
    /** Collapses repeats, e.g. one review reminder per SOP per due date. */
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt), uniqueIndex("notifications_dedupe_idx").on(t.userId, t.dedupeKey)],
);

/** "This step is unclear / wrong" from readers, routed to the SOP owner. */
export const feedback = pgTable(
  "feedback",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sopId: text("sop_id")
      .notNull()
      .references(() => sops.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => sopVersions.id, { onDelete: "cascade" }),
    blockKey: text("block_key").notNull(),
    blockLabel: text("block_label").notNull().default(""),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: feedbackType("type").notNull(),
    message: text("message").notNull().default(""),
    status: feedbackStatus("status").notNull().default("open"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("feedback_sop_idx").on(t.sopId, t.status)],
);

export type Suggestion = { blockKey: string; field: "text" | "title" | "description" | "expectedResult" | "warning"; before: string; after: string };

/** Threaded comments on an SOP or one of its blocks. A comment can carry a suggested edit. */
export const comments = pgTable(
  "comments",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sopId: text("sop_id")
      .notNull()
      .references(() => sops.id, { onDelete: "cascade" }),
    blockKey: text("block_key"),
    parentId: text("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    mentions: text("mentions").array().notNull().default(sql`'{}'::text[]`),
    suggestion: jsonb("suggestion").$type<Suggestion>(),
    suggestionStatus: suggestionStatus("suggestion_status"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [index("comments_sop_idx").on(t.sopId, t.createdAt)],
);

/** One time someone worked through an SOP as a checklist. */
export const runs = pgTable(
  "runs",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sopId: text("sop_id")
      .notNull()
      .references(() => sops.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => sopVersions.id),
    label: text("label").notNull().default(""),
    startedBy: text("started_by")
      .notNull()
      .references(() => users.id),
    status: runStatus("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("runs_sop_idx").on(t.sopId, t.startedAt)],
);

export const runSteps = pgTable(
  "run_steps",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    blockId: text("block_id").notNull(),
    blockKey: text("block_key").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by").references(() => users.id, { onDelete: "set null" }),
    skipped: boolean("skipped").notNull().default(false),
    note: text("note").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.runId, t.blockId] })],
);

/** Reusable groups of blocks. SOPs reference a snippet; unpinned references always show the latest version. */
export const snippets = pgTable("snippets", {
  id: id(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  currentVersion: integer("current_version").notNull().default(1),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every saved version of a snippet is kept, so pinned references never change. */
export const snippetVersions = pgTable(
  "snippet_versions",
  {
    snippetId: text("snippet_id")
      .notNull()
      .references(() => snippets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    blocks: jsonb("blocks").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.snippetId, t.version] })],
);

// ---------- Phase 3: integrations, sharing, training and analytics ----------

/** Personal API tokens. A key acts as its owner, capped at its own role (a viewer key can only read). */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** First characters of the token, shown so people can tell keys apart. */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    role: apiKeyRole("role").notNull().default("viewer"),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("api_keys_user_idx").on(t.userId)],
);

export const webhooks = pgTable("webhooks", {
  id: id(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  /** HMAC-SHA256 signing secret; receivers verify the X-HCC-Signature header with it. */
  secret: text("secret").notNull(),
  events: text("events").array().notNull(),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    status: deliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt), index("webhook_deliveries_hook_idx").on(t.webhookId, t.createdAt)],
);

/** A link that opens one SOP without signing in. Optional password and expiry; can be revoked. */
export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sopId: text("sop_id")
      .notNull()
      .references(() => sops.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    label: text("label").notNull().default(""),
    passwordHash: text("password_hash"),
    /** Pin to one version; null always shows the current version. */
    versionId: text("version_id").references(() => sopVersions.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("share_links_sop_idx").on(t.sopId)],
);

export const sopViews = pgTable(
  "sop_views",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sopId: text("sop_id")
      .notNull()
      .references(() => sops.id, { onDelete: "cascade" }),
    versionId: text("version_id"),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    source: viewSource("source").notNull().default("app"),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sop_views_sop_idx").on(t.sopId, t.viewedAt), index("sop_views_ws_idx").on(t.workspaceId, t.viewedAt)],
);

export type QuizQuestion = { id: string; prompt: string; choices: string[]; answer: number; explanation?: string };

/** One multiple-choice quiz per SOP, used by training assignments. */
export const quizzes = pgTable("quizzes", {
  sopId: text("sop_id")
    .primaryKey()
    .references(() => sops.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  questions: jsonb("questions").$type<QuizQuestion[]>().notNull(),
  passPercent: integer("pass_percent").notNull().default(80),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainingAssignments = pgTable(
  "training_assignments",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sopId: text("sop_id")
      .notNull()
      .references(() => sops.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedBy: text("assigned_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note").notNull().default(""),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: createdAt(),
    /** When they confirmed they read the SOP (and passed the quiz, if there is one). */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** The version they were trained on. */
    completedVersionId: text("completed_version_id").references(() => sopVersions.id),
  },
  (t) => [index("training_user_idx").on(t.userId, t.completedAt), index("training_sop_idx").on(t.sopId)],
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sopId: text("sop_id")
      .notNull()
      .references(() => sops.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignmentId: text("assignment_id").references(() => trainingAssignments.id, { onDelete: "set null" }),
    answers: jsonb("answers").$type<number[]>().notNull(),
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    passed: boolean("passed").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("quiz_attempts_user_idx").on(t.userId, t.sopId)],
);
