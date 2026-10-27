import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  doublePrecision,
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
  /** Topic on an ntfy server for phone push notifications. */
  ntfyTopic: text("ntfy_topic"),
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

export type WorkspaceSettings = {
  /** Hours before a task's due date to remind assignees. */
  reminderHours?: number;
  ntfyServer?: string;
  /** Public address of the app, used in links sent to phones and calendars. */
  appUrl?: string;
  /** Secret in the calendar feed URL. */
  calendarToken?: string;
};

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  branding: jsonb("branding").$type<Branding>().notNull().default({}),
  settings: jsonb("settings").$type<WorkspaceSettings>().notNull().default({}),
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
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#a3a3a3"),
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
  /** Project files (attachments, contracts, config backups) need an editor to download; SOP media doesn't. */
  private: boolean("private").notNull().default(false),
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

// ---------- Production modules (ported from the original app) ----------

const ws = () =>
  text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
/** Calendar dates (no time zone), stored as YYYY-MM-DD. */
const day = (name: string) => date(name, { mode: "string" });

/** A file attached to something: an upload in /files, or a link to Drive, Dropbox, OneDrive or Box. */
export type Attachment = { url: string; name: string; size?: number; mime?: string; external?: boolean };

/** The production team roster. A person may also be an app user. */
export const people = pgTable("people", {
  id: id(),
  workspaceId: ws(),
  name: text("name").notNull(),
  roleIds: text("role_ids").array().notNull().default(sql`'{}'::text[]`),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  status: text("status").notNull().default("available"),
  statusNote: text("status_note").notNull().default(""),
  lastCheckIn: timestamp("last_check_in", { withTimezone: true }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projects = pgTable("projects", {
  id: id(),
  workspaceId: ws(),
  name: text("name").notNull(),
  status: text("status").notNull().default("planning"),
  start: day("start"),
  end: day("end"),
  color: text("color").notNull().default("#a3a3a3"),
  summary: text("summary").notNull().default(""),
  description: text("description").notNull().default(""),
  budgetCents: integer("budget_cents").notNull().default(0),
  leadId: text("lead_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    workspaceId: ws(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("todo"),
    priority: text("priority").notNull().default("medium"),
    assignees: text("assignees").array().notNull().default(sql`'{}'::text[]`),
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    start: day("start"),
    due: day("due"),
    position: doublePrecision("position").notNull().default(0),
    attachments: jsonb("attachments").$type<Attachment[]>().notNull().default([]),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    overdueNotifiedAt: timestamp("overdue_notified_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tasks_project_idx").on(t.projectId, t.status, t.position), index("tasks_due_idx").on(t.due)],
);

/** Comments on project work (tasks, punch items, purchase orders…). SOP comments live in `comments`. */
export const workComments = pgTable(
  "work_comments",
  {
    id: id(),
    workspaceId: ws(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    mentions: text("mentions").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [index("work_comments_target_idx").on(t.targetType, t.targetId, t.createdAt)],
);

/** "Edwin changed status from To Do to In Progress": the history shown on projects and tasks. */
export const activity = pgTable(
  "activity",
  {
    id: id(),
    workspaceId: ws(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    targetName: text("target_name").notNull().default(""),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("activity_project_idx").on(t.projectId, t.createdAt), index("activity_target_idx").on(t.targetType, t.targetId)],
);

export const cables = pgTable(
  "cables",
  {
    id: id(),
    workspaceId: ws(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    type: text("type").notNull().default("Other"),
    from: text("from_location").notNull().default(""),
    to: text("to_location").notNull().default(""),
    lengthFt: doublePrecision("length_ft"),
    status: text("status").notNull().default("planned"),
    room: text("room").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("cables_project_idx").on(t.projectId)],
);

export type LayoutItem = { id: string; type: string; label: string; x: number; y: number; w?: number; h?: number; gearId?: string };
export type LayoutRun = { id: string; from: string; to: string; label: string; color?: string; cableId?: string; style?: "straight" | "elbow" };

export const layouts = pgTable("layouts", {
  id: id(),
  workspaceId: ws(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  backgroundUrl: text("background_url"),
  width: integer("width").notNull().default(1000),
  height: integer("height").notNull().default(640),
  items: jsonb("items").$type<LayoutItem[]>().notNull().default([]),
  runs: jsonb("runs").$type<LayoutRun[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projectPhotos = pgTable("project_photos", {
  id: id(),
  workspaceId: ws(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  caption: text("caption").notNull().default(""),
  takenBy: text("taken_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const bomItems = pgTable("bom_items", {
  id: id(),
  workspaceId: ws(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  item: text("item").notNull(),
  partNumber: text("part_number").notNull().default(""),
  vendor: text("vendor").notNull().default(""),
  category: text("category").notNull().default("Other"),
  qty: doublePrecision("qty").notNull().default(1),
  unitCostCents: integer("unit_cost_cents").notNull().default(0),
  status: text("status").notNull().default("needed"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type PoLine = { id: string; desc: string; qty: number; unitCostCents: number; receivedQty: number; bomItemId?: string | null };

export const purchaseOrders = pgTable("purchase_orders", {
  id: id(),
  workspaceId: ws(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  poNumber: text("po_number").notNull(),
  vendor: text("vendor").notNull().default(""),
  date: day("date"),
  status: text("status").notNull().default("draft"),
  category: text("category").notNull().default("Other"),
  notes: text("notes").notNull().default(""),
  lines: jsonb("lines").$type<PoLine[]>().notNull().default([]),
  receivedDate: day("received_date"),
  attachments: jsonb("attachments").$type<Attachment[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contractors = pgTable("contractors", {
  id: id(),
  workspaceId: ws(),
  company: text("company").notNull(),
  contact: text("contact").notNull().default(""),
  trade: text("trade").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  insuranceExpires: day("insurance_expires"),
  rate: text("rate").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const scopesOfWork = pgTable("scopes_of_work", {
  id: id(),
  workspaceId: ws(),
  contractorId: text("contractor_id")
    .notNull()
    .references(() => contractors.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  valueCents: integer("value_cents").notNull().default(0),
  start: day("start"),
  end: day("end"),
  body: text("body").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const siteAccess = pgTable("site_access", {
  id: id(),
  workspaceId: ws(),
  contractorId: text("contractor_id").references(() => contractors.id, { onDelete: "cascade" }),
  who: text("who").notNull(),
  from: day("from_date"),
  to: day("to_date"),
  hours: text("hours").notNull().default(""),
  areas: text("areas").notNull().default(""),
  badge: text("badge").notNull().default(""),
  approvedBy: text("approved_by").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const punchItems = pgTable("punch_items", {
  id: id(),
  workspaceId: ws(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  contractorId: text("contractor_id").references(() => contractors.id, { onDelete: "set null" }),
  location: text("location").notNull().default(""),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  due: day("due"),
  photos: jsonb("photos").$type<Attachment[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const invoices = pgTable("invoices", {
  id: id(),
  workspaceId: ws(),
  contractorId: text("contractor_id").references(() => contractors.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  number: text("number").notNull().default(""),
  date: day("date"),
  dueDate: day("due_date"),
  amountCents: integer("amount_cents").notNull().default(0),
  status: text("status").notNull().default("received"),
  notes: text("notes").notNull().default(""),
  attachments: jsonb("attachments").$type<Attachment[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type FirmwareChange = { from: string; to: string; at: string; by: string; note?: string };
export type ConfigBackup = { id: string; url: string; name: string; size: number; note: string; at: string; by: string };

export const gear = pgTable("gear", {
  id: id(),
  workspaceId: ws(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Other"),
  manufacturer: text("manufacturer").notNull().default(""),
  model: text("model").notNull().default(""),
  serial: text("serial").notNull().default(""),
  assetTag: text("asset_tag").notNull().default(""),
  location: text("location").notNull().default(""),
  status: text("status").notNull().default("in_service"),
  firmware: text("firmware").notNull().default(""),
  firmwareUpdated: day("firmware_updated"),
  firmwareHistory: jsonb("firmware_history").$type<FirmwareChange[]>().notNull().default([]),
  ip: text("ip").notNull().default(""),
  mac: text("mac").notNull().default(""),
  purchaseDate: day("purchase_date"),
  warranty: day("warranty"),
  notes: text("notes").notNull().default(""),
  configs: jsonb("configs").$type<ConfigBackup[]>().notNull().default([]),
  photos: jsonb("photos").$type<Attachment[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
