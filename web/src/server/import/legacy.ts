import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  activity,
  bomItems,
  cables,
  contractors,
  files,
  folders,
  gear,
  invoices,
  layouts,
  legacyIds,
  people,
  projectPhotos,
  projects,
  punchItems,
  purchaseOrders,
  scopesOfWork,
  siteAccess,
  tasks,
  teamRoles,
  users,
  workComments,
  workspaceMembers,
  workspaces,
  type Attachment,
  type ConfigBackup,
  type FirmwareChange,
  type LayoutItem,
  type LayoutRun,
  type PoLine,
} from "@/db/schema";
import { DEVICE_TYPE_KEYS } from "@/lib/cabling";
import { BOM_STATUSES, INVOICE_STATUSES, PO_STATUSES, SOW_STATUSES } from "@/lib/purchasing";
import { PUNCH_STATUSES } from "@/lib/contractors";
import { CABLE_STATUSES } from "@/lib/cabling";
import { GEAR_STATUSES } from "@/lib/gear";
import { PERSON_STATUSES } from "@/lib/roster";
import { PRIORITIES, PROJECT_STATUSES, TASK_STATUSES } from "@/lib/work";
import type { Actor } from "@/server/permissions";
import { sniffAttachment } from "@/server/services/files";
import { createSop, getOrCreateDraft, publishDraft, saveDraft } from "@/server/services/sops";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/services/workspace";
import { storage } from "@/server/storage";
import { legacyMarkdownToBlocks } from "./legacy-markdown";

/**
 * Brings everything from the original app (one SQLite file plus its uploads folder) into this one: users with
 * their passwords, the roster, SOPs (Markdown → blocks), projects and tasks with comments and history, cabling,
 * layouts, purchasing, contractors, gear, photos and files. Every imported record is remembered in legacy_ids,
 * so running it again only adds what's new.
 */

type Doc = Record<string, unknown>;
export type LegacyUser = { id: string; username: string; name: string | null; email: string | null; role: string; password_hash: string | null; ntfy_topic: string | null; person_id: string | null };
export type LegacyFile = { id: string; name: string | null; mime: string | null; size: number | null };
export type LegacySource = {
  users: LegacyUser[];
  docs: Record<string, Doc[]>;
  files: Map<string, LegacyFile>;
  readFile: (id: string) => Promise<Uint8Array | null>;
};
export type ImportSummary = { counts: Record<string, number>; warnings: string[] };

const str = (d: Doc, k: string, max = 10_000) => (typeof d[k] === "string" ? (d[k] as string).slice(0, max) : typeof d[k] === "number" ? String(d[k]) : "");
const num = (d: Doc, k: string) => {
  const v = Number(d[k]);
  return Number.isFinite(v) ? v : 0;
};
const arr = (d: Doc, k: string) => (Array.isArray(d[k]) ? (d[k] as Doc[]) : []);
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const when = (v: unknown) => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t) : undefined;
};
const cents = (v: unknown) => Math.round((Number(v) || 0) * 100);

/** "To Do" → "todo", "Partially Received" → "partially_received", unknown → fallback. */
const ALIASES: Record<string, string> = { to_do: "todo", serving_sunday: "serving" };
function status<T extends string>(all: readonly T[], label: unknown, fallback: T): T {
  const k = String(label ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const v = ALIASES[k] ?? k;
  return (all as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Folder code prefix from a group name: "Sunday Service" → "SS", made unique with a number. */
function prefixFor(name: string, taken: Set<string>) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const base = (words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "GEN").slice(0, 3)).slice(0, 8) || "GEN";
  let p = base;
  for (let i = 2; taken.has(p); i++) p = `${base}${i}`;
  taken.add(p);
  return p;
}

const TARGET_TYPE: Record<string, string> = { tasks: "task", projects: "project", purchases: "po", punch: "punch", invoices: "invoice", bom: "bom", cables: "cable", sow: "sow", layouts: "layout", gear: "gear" };

export async function importLegacy(db: DB, src: LegacySource, log: (line: string) => void = () => {}): Promise<ImportSummary> {
  const counts: Record<string, number> = {};
  const warnings: string[] = [];
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const docs = (coll: string) => src.docs[coll] ?? [];

  return db.transaction(async (tx) => {
    let [ws] = await tx.select().from(workspaces).where(eq(workspaces.slug, DEFAULT_WORKSPACE_SLUG)).limit(1);
    if (!ws) [ws] = await tx.insert(workspaces).values({ name: process.env.ORG_NAME ?? "Hope Christian Church", slug: DEFAULT_WORKSPACE_SLUG }).returning();
    const workspaceId = ws.id;

    // ---------- id mapping ----------
    const map = new Map<string, string>();
    for (const r of await tx.select().from(legacyIds).where(eq(legacyIds.workspaceId, workspaceId))) map.set(`${r.collection}:${r.legacyId}`, r.newId);
    const idOf = (coll: string, legacyId: unknown) => (typeof legacyId === "string" ? map.get(`${coll}:${legacyId}`) : undefined);
    const remember = async (coll: string, legacyId: string, newId: string) => {
      map.set(`${coll}:${legacyId}`, newId);
      await tx.insert(legacyIds).values({ workspaceId, collection: coll, legacyId, newId }).onConflictDoNothing();
    };
    /** Runs `make` for documents not imported yet. */
    const each = async (coll: string, make: (d: Doc) => Promise<string | null>) => {
      for (const d of docs(coll)) {
        const legacyId = str(d, "id");
        if (!legacyId || idOf(coll, legacyId)) continue;
        try {
          const id = await make(d);
          if (id) {
            await remember(coll, legacyId, id);
            bump(coll);
          }
        } catch (e) {
          warnings.push(`${coll} ${legacyId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    };

    // ---------- files ----------
    const fileUrl = async (legacyFileId: unknown, opts: { private: boolean }): Promise<Attachment | null> => {
      if (typeof legacyFileId !== "string") return null;
      const known = idOf("files", legacyFileId);
      const meta = src.files.get(legacyFileId);
      if (known) return { url: `/files/${known}`, name: meta?.name ?? "file", size: meta?.size ?? undefined, mime: meta?.mime ?? undefined };
      const bytes = await src.readFile(legacyFileId);
      if (!bytes) {
        warnings.push(`File ${legacyFileId} (${meta?.name ?? "unknown"}) is missing from the uploads folder.`);
        return null;
      }
      const id = crypto.randomUUID();
      const mime = sniffAttachment(bytes);
      const storageKey = `${workspaceId}/${id}`;
      await storage().put(storageKey, bytes);
      const name = (meta?.name || "file").replace(/[\\/\0]/g, "_").slice(0, 200);
      await tx.insert(files).values({ id, workspaceId, name, mime, size: bytes.byteLength, storageKey, private: opts.private });
      await remember("files", legacyFileId, id);
      bump("files");
      return { url: `/files/${id}`, name, size: bytes.byteLength, mime };
    };
    const attachments = async (list: Doc[], opts = { private: true }) => {
      const out: Attachment[] = [];
      for (const a of list) {
        if (typeof a.url === "string" && /^https?:\/\//.test(a.url)) out.push({ url: a.url, name: str(a, "name", 200) || a.url.slice(0, 200), external: true });
        else {
          const f = await fileUrl(a.fileId ?? a.id, opts);
          if (f) out.push({ ...f, name: str(a, "name", 200) || f.name });
        }
      }
      return out;
    };

    // ---------- users ----------
    const userIds = new Map<string, string>();
    for (const u of src.users) {
      const username = u.username.toLowerCase();
      let [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
      if (!existing) {
        const hash = u.password_hash?.startsWith("scrypt:") ? u.password_hash : null;
        [existing] = await tx.insert(users).values({ username, name: u.name || username, email: u.email || null, passwordHash: hash, ntfyTopic: u.ntfy_topic || null }).returning({ id: users.id });
        const role = u.role === "admin" || u.role === "editor" ? u.role : "viewer";
        await tx.insert(workspaceMembers).values({ workspaceId, userId: existing.id, role }).onConflictDoNothing();
        bump("users");
        log(`  user  ${username} as ${role}${hash ? "" : " (no password: set one under People)"}`);
      }
      userIds.set(u.id, existing.id);
    }
    const user = (legacyId: unknown) => (typeof legacyId === "string" ? (userIds.get(legacyId) ?? null) : null);
    const userList = (v: unknown) => (Array.isArray(v) ? (v.map(user).filter(Boolean) as string[]) : []);

    // An admin to own and publish imported SOPs.
    const [admin] = await tx
      .select({ id: users.id, name: users.name, username: users.username })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "admin")))
      .limit(1);
    if (!admin) throw new Error("The old app has no admin account to import as. Create one first.");
    const actor: Actor = { userId: admin.id, name: admin.name, username: admin.username, role: "admin", workspaceId };

    // ---------- settings ----------
    const settings = docs("settings").find((d) => d.id === "global") ?? {};
    const keep = Object.fromEntries(
      Object.entries({ reminderHours: Number(settings.reminderHours) || undefined, ntfyServer: str(settings, "ntfyServer") || undefined, appUrl: str(settings, "appUrl") || undefined, calendarToken: str(settings, "calendarToken") || undefined }).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(keep).length) await tx.update(workspaces).set({ settings: sql`${JSON.stringify(keep)}::jsonb || coalesce(${workspaces.settings}, '{}'::jsonb)` }).where(eq(workspaces.id, workspaceId));
    if (str(settings, "slackWebhook") || str(settings, "teamsWebhook")) warnings.push("Slack and Teams channel posts aren't carried over. Use webhooks under Integrations instead.");
    if (docs("webhooks").length) warnings.push(`${docs("webhooks").length} webhook(s) weren't imported: recreate them under Integrations (the event names changed).`);

    // ---------- roster ----------
    const roleRows = await tx.select().from(teamRoles).where(eq(teamRoles.workspaceId, workspaceId));
    await each("teamRoles", async (d) => {
      const name = str(d, "name", 80) || "Role";
      const match = roleRows.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (match) {
        await tx.update(teamRoles).set({ description: str(d, "description", 500) || match.description, color: /^#[0-9a-f]{6}$/i.test(str(d, "color")) ? str(d, "color") : match.color }).where(eq(teamRoles.id, match.id));
        return match.id;
      }
      const [r] = await tx.insert(teamRoles).values({ workspaceId, name, description: str(d, "description", 500), color: /^#[0-9a-f]{6}$/i.test(str(d, "color")) ? str(d, "color") : "#a3a3a3" }).returning();
      return r.id;
    });
    const personUser = new Map(src.users.filter((u) => u.person_id).map((u) => [u.person_id!, userIds.get(u.id)!]));
    await each("people", async (d) => {
      const [p] = await tx
        .insert(people)
        .values({
          workspaceId,
          name: str(d, "name", 120) || "Unnamed",
          roleIds: (Array.isArray(d.roles) ? d.roles : []).map((r) => idOf("teamRoles", r)).filter(Boolean) as string[],
          email: str(d, "email", 200),
          phone: str(d, "phone", 40),
          status: status(PERSON_STATUSES, d.status, "available"),
          statusNote: str(d, "statusNote", 200),
          lastCheckIn: when(d.lastCheckIn) ?? null,
          userId: (typeof d.userId === "string" ? user(d.userId) : null) ?? personUser.get(str(d, "id")) ?? null,
        })
        .returning();
      return p.id;
    });

    // ---------- SOPs ----------
    const existingFolders = await tx.select().from(folders).where(eq(folders.workspaceId, workspaceId));
    const prefixes = new Set(existingFolders.map((f) => f.codePrefix));
    const folderFor = async (name: string, visibility: "public" | "members") => {
      const found = existingFolders.find((f) => f.name.toLowerCase() === name.toLowerCase() && !f.parentId);
      if (found) return found.id;
      const [f] = await tx.insert(folders).values({ workspaceId, name, codePrefix: prefixFor(name, prefixes), visibility, position: existingFolders.length }).returning();
      existingFolders.push(f);
      return f.id;
    };
    const sopDocs = [...docs("sops")].sort((a, b) => str(a, "group").localeCompare(str(b, "group")) || num(a, "order") - num(b, "order"));
    const groups = new Map<string, Doc[]>();
    for (const s of sopDocs) groups.set(str(s, "group") || "General", [...(groups.get(str(s, "group") || "General") ?? []), s]);
    for (const s of sopDocs) {
      const legacyId = str(s, "id");
      if (idOf("sops", legacyId)) continue;
      try {
        const group = str(s, "group") || "General";
        // A folder's visibility is all-or-nothing, so members-only SOPs in a public group get their own folder.
        const inGroup = groups.get(group) ?? [];
        const mixed = inGroup.some((x) => x.public === false) && inGroup.some((x) => x.public !== false);
        const folderName = s.public === false && mixed ? `${group} (members)` : group;
        const folderId = await folderFor(folderName, s.public === false ? "members" : "public");
        let body = str(s, "body", 500_000);
        for (const m of [...body.matchAll(/\/files\/([\w-]+)/g)]) {
          const f = await fileUrl(m[1], { private: false });
          if (f) body = body.replaceAll(`/files/${m[1]}`, f.url);
        }
        const blocks = legacyMarkdownToBlocks(body);
        const sop = await createSop(tx, actor, { title: str(s, "title", 200) || "Untitled SOP", folderId, summary: str(s, "description", 1000) });
        const { draft } = await getOrCreateDraft(tx, actor, sop.id);
        await saveDraft(tx, actor, sop.id, { title: str(s, "title", 200) || "Untitled SOP", summary: str(s, "description", 1000), blocks, baseUpdatedAt: draft.updatedAt.toISOString() });
        await publishDraft(tx, actor, sop.id, { changeSummary: "Imported from the previous app" });
        await remember("sops", legacyId, sop.id);
        bump("sops");
      } catch (e) {
        warnings.push(`sops ${legacyId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ---------- projects and tasks ----------
    await each("projects", async (d) => {
      const [p] = await tx
        .insert(projects)
        .values({
          workspaceId,
          name: str(d, "name", 120) || "Untitled project",
          status: status(PROJECT_STATUSES, d.status, "planning"),
          start: day(d.start),
          end: day(d.end),
          color: /^#[0-9a-f]{6}$/i.test(str(d, "color")) ? str(d, "color") : "#a3a3a3",
          summary: str(d, "summary", 300),
          description: str(d, "description", 20_000),
          budgetCents: cents(d.budget),
          leadId: user(d.lead),
          createdAt: when(d.createdAt),
        })
        .returning();
      return p.id;
    });
    const project = (v: unknown) => idOf("projects", v) ?? null;
    let position = 0;
    await each("tasks", async (d) => {
      const projectId = project(d.projectId);
      if (!projectId) throw new Error("its project wasn't imported");
      const st = status(TASK_STATUSES, d.status, "todo");
      const [t] = await tx
        .insert(tasks)
        .values({
          workspaceId,
          projectId,
          title: str(d, "title", 300) || "Untitled task",
          description: str(d, "description", 20_000),
          status: st,
          priority: status(PRIORITIES, d.priority, "medium"),
          assignees: userList(d.assignees),
          labels: (Array.isArray(d.labels) ? d.labels : []).filter((l): l is string => typeof l === "string").map((l) => l.slice(0, 40)).slice(0, 20),
          start: day(d.start),
          due: day(d.due),
          position: Number(d.order) || ++position,
          attachments: await attachments(arr(d, "attachments")),
          reminderSentAt: d.reminderSent ? new Date() : null,
          overdueNotifiedAt: d.overdueNotified ? new Date() : null,
          completedAt: st === "done" ? (when(d.updatedAt) ?? new Date()) : null,
          createdBy: user(d.createdBy),
          createdAt: when(d.createdAt),
        })
        .returning();
      return t.id;
    });
    // Subtasks point at parents that may come later in the list, so link them once every task exists.
    for (const d of docs("tasks")) {
      const id = idOf("tasks", d.id);
      const parent = idOf("tasks", d.parentId);
      if (id && parent) await tx.update(tasks).set({ parentId: parent }).where(eq(tasks.id, id));
    }
    await each("comments", async (d) => {
      const [coll, target] = str(d, "target").split(":");
      const taskId = coll === "tasks" ? idOf("tasks", target) : undefined;
      if (!taskId) return null; // Only task comments existed in practice.
      const [t] = await tx.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId));
      const [c] = await tx
        .insert(workComments)
        .values({ workspaceId, targetType: "task", targetId: taskId, projectId: t.projectId, authorId: user(d.authorId), body: str(d, "body", 5000) || "(empty)", createdAt: when(d.createdAt) })
        .returning();
      return c.id;
    });

    // ---------- cabling and layouts ----------
    await each("cables", async (d) => {
      const projectId = project(d.projectId);
      if (!projectId) throw new Error("its project wasn't imported");
      const [c] = await tx
        .insert(cables)
        .values({ workspaceId, projectId, label: str(d, "label", 40) || "?", type: str(d, "type", 40) || "Other", from: str(d, "from", 120), to: str(d, "to", 120), lengthFt: d.lengthFt === undefined || d.lengthFt === "" ? null : num(d, "lengthFt"), status: status(CABLE_STATUSES, d.status, "planned"), room: str(d, "room", 80), notes: str(d, "notes", 1000) })
        .returning();
      return c.id;
    });
    await each("layouts", async (d) => {
      const projectId = project(d.projectId);
      if (!projectId) throw new Error("its project wasn't imported");
      const bg = d.background ? await fileUrl(d.background, { private: true }) : null;
      const items: LayoutItem[] = arr(d, "items").map((i) => ({
        id: str(i, "id", 64),
        type: (DEVICE_TYPE_KEYS as string[]).includes(str(i, "type")) ? str(i, "type") : "jack",
        label: str(i, "label", 80),
        x: num(i, "x"),
        y: num(i, "y"),
        ...(i.w !== undefined ? { w: num(i, "w"), h: num(i, "h") } : {}),
        ...(idOf("gear", i.gearId) ? { gearId: idOf("gear", i.gearId) } : {}),
      }));
      const runs: LayoutRun[] = arr(d, "runs").map((r) => ({
        id: str(r, "id", 64),
        from: str(r, "from", 64),
        to: str(r, "to", 64),
        label: str(r, "label", 60),
        ...(/^#[0-9a-f]{6}$/i.test(str(r, "color")) ? { color: str(r, "color") } : {}),
        ...(idOf("cables", r.cableId) ? { cableId: idOf("cables", r.cableId) } : {}),
        style: r.style === "elbow" ? "elbow" : "straight",
      }));
      const [l] = await tx
        .insert(layouts)
        .values({ workspaceId, projectId, name: str(d, "name", 120) || "Layout", backgroundUrl: bg?.url ?? null, width: num(d, "width") || 1000, height: num(d, "height") || 640, items, runs })
        .returning();
      return l.id;
    });

    // ---------- purchasing ----------
    await each("bom", async (d) => {
      const projectId = project(d.projectId);
      if (!projectId) throw new Error("its project wasn't imported");
      const [b] = await tx
        .insert(bomItems)
        .values({ workspaceId, projectId, item: str(d, "item", 200) || "Item", partNumber: str(d, "partNumber", 80), vendor: str(d, "vendor", 120), category: str(d, "category", 40) || "Other", qty: num(d, "qty"), unitCostCents: cents(d.unitCost), status: status(BOM_STATUSES, d.status, "needed") })
        .returning();
      return b.id;
    });
    await each("purchases", async (d) => {
      const projectId = project(d.projectId);
      if (!projectId) throw new Error("its project wasn't imported");
      const lines: PoLine[] = arr(d, "lines").map((l) => ({ id: crypto.randomUUID().slice(0, 8), desc: str(l, "desc", 200) || "Item", qty: num(l, "qty"), unitCostCents: cents(l.unitCost), receivedQty: num(l, "receivedQty"), bomItemId: null }));
      const [p] = await tx
        .insert(purchaseOrders)
        .values({ workspaceId, projectId, poNumber: str(d, "poNumber", 40) || "PO", vendor: str(d, "vendor", 120), date: day(d.date), status: status(PO_STATUSES, d.status, "draft"), category: str(d, "category", 40) || "Other", notes: str(d, "notes", 2000), lines, receivedDate: day(d.receivedDate), attachments: await attachments(arr(d, "attachments")) })
        .returning();
      return p.id;
    });

    // ---------- contractors ----------
    await each("contractors", async (d) => {
      const [c] = await tx
        .insert(contractors)
        .values({ workspaceId, company: str(d, "company", 160) || "Contractor", contact: str(d, "contact", 120), trade: str(d, "trade", 80), phone: str(d, "phone", 40), email: str(d, "email", 200), insuranceExpires: day(d.insuranceExpires), rate: str(d, "rate", 80), notes: str(d, "notes", 4000), attachments: await attachments(arr(d, "attachments")) })
        .returning();
      return c.id;
    });
    const contractor = (v: unknown) => idOf("contractors", v) ?? null;
    await each("sow", async (d) => {
      const contractorId = contractor(d.contractorId);
      if (!contractorId) throw new Error("its contractor wasn't imported");
      const [s] = await tx
        .insert(scopesOfWork)
        .values({ workspaceId, contractorId, projectId: project(d.projectId), title: str(d, "title", 200) || "Scope of work", status: status(SOW_STATUSES, d.status, "draft"), valueCents: cents(d.value), start: day(d.start), end: day(d.end), body: str(d, "body", 50_000), attachments: await attachments(arr(d, "attachments")) })
        .returning();
      return s.id;
    });
    await each("access", async (d) => {
      const [a] = await tx
        .insert(siteAccess)
        .values({ workspaceId, contractorId: contractor(d.contractorId), who: str(d, "who", 160) || "Visitor", from: day(d.from), to: day(d.to), hours: str(d, "hours", 80), areas: str(d, "areas", 300), badge: str(d, "badge", 120), approvedBy: str(d, "approvedBy", 120), notes: str(d, "notes", 2000) })
        .returning();
      return a.id;
    });
    await each("punch", async (d) => {
      const projectId = project(d.projectId);
      if (!projectId) throw new Error("its project wasn't imported");
      const [p] = await tx
        .insert(punchItems)
        .values({ workspaceId, projectId, contractorId: contractor(d.contractorId), location: str(d, "location", 160), description: str(d, "description", 1000) || "Punch item", status: status(PUNCH_STATUSES, d.status, "open"), due: day(d.due), photos: await attachments(arr(d, "photos")) })
        .returning();
      return p.id;
    });
    await each("invoices", async (d) => {
      const [i] = await tx
        .insert(invoices)
        .values({ workspaceId, contractorId: contractor(d.contractorId), projectId: project(d.projectId), number: str(d, "number", 60), date: day(d.date), dueDate: day(d.dueDate), amountCents: cents(d.amount), status: status(INVOICE_STATUSES, d.status, "received"), notes: str(d, "notes", 2000), attachments: await attachments(arr(d, "attachments")) })
        .returning();
      return i.id;
    });

    // ---------- gear ----------
    await each("gear", async (d) => {
      const configs: ConfigBackup[] = [];
      for (const c of arr(d, "configs")) {
        const f = await fileUrl(c.fileId ?? c.id, { private: true });
        if (f) configs.push({ id: crypto.randomUUID().slice(0, 8), url: f.url, name: str(c, "name", 200) || f.name, size: f.size ?? 0, mime: f.mime, note: str(c, "note", 500), firmware: str(c, "firmware", 60) || undefined, at: when(c.at)?.toISOString() ?? new Date().toISOString(), by: user(c.by) ?? "" });
      }
      const history: FirmwareChange[] = arr(d, "firmwareHistory").map((h) => ({ from: str(h, "from", 60), to: str(h, "to", 60), at: str(h, "at", 40), by: user(h.by) ?? "", ...(str(h, "note") ? { note: str(h, "note", 500) } : {}) }));
      const [g] = await tx
        .insert(gear)
        .values({
          workspaceId,
          name: str(d, "name", 160) || "Gear",
          category: str(d, "category", 40) || "Other",
          manufacturer: str(d, "manufacturer", 120),
          model: str(d, "model", 120),
          serial: str(d, "serial", 120),
          assetTag: str(d, "assetTag", 60),
          location: str(d, "location", 160),
          status: status(GEAR_STATUSES, d.status, "in_service"),
          firmware: str(d, "firmware", 60),
          firmwareUpdated: day(d.firmwareUpdated),
          firmwareHistory: history,
          ip: str(d, "ip", 64),
          mac: str(d, "mac", 32),
          purchaseDate: day(d.purchaseDate),
          warranty: day(d.warranty),
          notes: str(d, "notes", 4000),
          configs,
          photos: await attachments(arr(d, "photos")),
        })
        .returning();
      return g.id;
    });
    // Layouts can link gear, which is imported after them: fill those links in now.
    for (const l of docs("layouts")) {
      const id = idOf("layouts", l.id);
      if (!id || !arr(l, "items").some((i) => i.gearId)) continue;
      const [row] = await tx.select().from(layouts).where(eq(layouts.id, id));
      const gearOf = new Map(arr(l, "items").map((i) => [str(i, "id"), idOf("gear", i.gearId)]));
      await tx.update(layouts).set({ items: row.items.map((i) => (gearOf.get(i.id) ? { ...i, gearId: gearOf.get(i.id) } : i)) }).where(eq(layouts.id, id));
    }

    // ---------- photos and history ----------
    await each("photos", async (d) => {
      const projectId = project(d.projectId);
      if (!projectId) throw new Error("its project wasn't imported");
      const f = await fileUrl(d.fileId, { private: true });
      if (!f) return null;
      const [p] = await tx
        .insert(projectPhotos)
        .values({ workspaceId, projectId, url: f.url, mime: f.mime?.startsWith("video/") ? f.mime : /^(image|video)\//.test(str(d, "mime")) ? str(d, "mime") : (f.mime ?? "image/jpeg"), caption: str(d, "caption", 300), location: str(d, "location", 120), takenBy: user(d.by), createdAt: when(d.takenAt) })
        .returning();
      return p.id;
    });
    await each("activity", async (d) => {
      const [coll, target] = str(d, "target").split(":");
      const type = TARGET_TYPE[coll] ?? "project";
      const [a] = await tx
        .insert(activity)
        .values({ workspaceId, projectId: project(d.projectId), targetType: type, targetId: idOf(coll, target) ?? target ?? "", targetName: str(d, "name", 200), actorId: user(d.actorId), text: str(d, "text", 1000) || "updated", createdAt: when(d.at) })
        .returning();
      return a.id;
    });

    log(`Imported: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing new"}.`);
    for (const w of warnings) log(`  note  ${w}`);
    return { counts, warnings };
  });
}

/** Reads the original app's data folder (hcc.db plus uploads/). */
export async function readLegacyFolder(dbFile: string, uploadsDir: string): Promise<LegacySource> {
  const { DatabaseSync } = await import("node:sqlite");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const legacy = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const usersRows = legacy.prepare("SELECT id, username, name, email, role, password_hash, ntfy_topic, person_id FROM users").all() as LegacyUser[];
    const docRows = legacy.prepare("SELECT coll, data FROM docs ORDER BY updated_at").all() as { coll: string; data: string }[];
    const fileRows = legacy.prepare("SELECT id, name, mime, size FROM files").all() as LegacyFile[];
    const docs: Record<string, Doc[]> = {};
    for (const r of docRows) (docs[r.coll] ??= []).push(JSON.parse(r.data));
    return {
      users: usersRows,
      docs,
      files: new Map(fileRows.map((f) => [f.id, f])),
      readFile: async (id) => {
        if (!/^[\w-]+$/.test(id)) return null;
        try {
          return new Uint8Array(await fs.readFile(path.join(uploadsDir, id)));
        } catch {
          return null;
        }
      },
    };
  } finally {
    legacy.close();
  }
}
