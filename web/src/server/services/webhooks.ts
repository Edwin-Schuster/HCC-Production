import crypto from "node:crypto";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { webhookDeliveries, webhooks } from "@/db/schema";
import { forbidden, notFound } from "@/server/errors";
import { atLeast, type Actor } from "@/server/permissions";
import { audit } from "./audit";

/**
 * Outgoing webhooks. Events are queued in the same transaction as the change that caused them, then sent by
 * the scheduler with an HMAC signature and retried with backoff, so a slow receiver never slows the app.
 */

export const WEBHOOK_EVENTS = ["sop.created", "sop.published", "sop.retired", "sop.restored", "feedback.created", "run.completed", "task.created", "task.completed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Minutes to wait before each retry; after the last one the delivery is marked failed. */
const BACKOFF = [1, 5, 30, 120, 720];

export const WebhookInput = z.object({
  url: z
    .string()
    .trim()
    .url("Enter a full URL")
    .max(2_000)
    .refine((u) => /^https?:\/\//i.test(u), "Use an http(s) URL"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Pick at least one event"),
});

const requireAdmin = (actor: Actor) => {
  if (!atLeast(actor, "admin")) throw forbidden("Only admins can manage webhooks.");
};

export async function createWebhook(db: Executor, actor: Actor, input: z.input<typeof WebhookInput>) {
  requireAdmin(actor);
  const data = WebhookInput.parse(input);
  const secret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
  const [row] = await db.insert(webhooks).values({ workspaceId: actor.workspaceId, url: data.url, events: data.events, secret, createdBy: actor.userId }).returning();
  await audit(db, actor, "webhook.created", { type: "webhook", id: row.id }, { url: data.url, events: data.events });
  return { id: row.id, secret };
}

export async function deleteWebhook(db: Executor, actor: Actor, id: string) {
  requireAdmin(actor);
  const [w] = await db.select().from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, actor.workspaceId))).limit(1);
  if (!w) throw notFound("Webhook not found.");
  await db.delete(webhooks).where(eq(webhooks.id, id));
  await audit(db, actor, "webhook.deleted", { type: "webhook", id }, { url: w.url });
}

export async function listWebhooks(db: Executor, actor: Actor) {
  requireAdmin(actor);
  const hooks = await db.select().from(webhooks).where(eq(webhooks.workspaceId, actor.workspaceId)).orderBy(asc(webhooks.createdAt));
  const out = [];
  for (const h of hooks) {
    const recent = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, h.id)).orderBy(desc(webhookDeliveries.createdAt)).limit(10);
    out.push({
      id: h.id,
      url: h.url,
      events: h.events,
      secret: h.secret,
      active: h.active,
      createdAt: h.createdAt.toISOString(),
      deliveries: recent.map((d) => ({ id: d.id, event: d.event, status: d.status, attempts: d.attempts, lastStatusCode: d.lastStatusCode, lastError: d.lastError, createdAt: d.createdAt.toISOString() })),
    });
  }
  return out;
}

/** Queues an event for every active webhook that wants it. Call inside the change's transaction. */
export async function emit(db: Executor, workspaceId: string, event: WebhookEvent, data: Record<string, unknown>) {
  const hooks = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(and(eq(webhooks.workspaceId, workspaceId), eq(webhooks.active, true), sql`${event} = any(${webhooks.events})`));
  if (!hooks.length) return;
  const payload = { event, createdAt: new Date().toISOString(), data };
  await db.insert(webhookDeliveries).values(hooks.map((h) => ({ webhookId: h.id, event, payload })));
}

export async function sendTest(db: Executor, actor: Actor, id: string) {
  requireAdmin(actor);
  const [w] = await db.select().from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, actor.workspaceId))).limit(1);
  if (!w) throw notFound("Webhook not found.");
  await db.insert(webhookDeliveries).values({ webhookId: w.id, event: "ping", payload: { event: "ping", createdAt: new Date().toISOString(), data: { message: "Hello from HCC Production" } } });
  await deliverDue(db);
}

export const sign = (secret: string, body: string) => `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

/** Sends every delivery that's due. Safe to run concurrently with itself only in one process (the scheduler). */
export async function deliverDue(db: Executor, now = new Date(), fetcher: typeof fetch = fetch) {
  const due = await db
    .select({ d: webhookDeliveries, url: webhooks.url, secret: webhooks.secret })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
    .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, now)))
    .orderBy(asc(webhookDeliveries.createdAt))
    .limit(50);
  for (const { d, url, secret } of due) {
    const body = JSON.stringify(d.payload);
    let code: number | null = null;
    let error: string | null = null;
    try {
      const res = await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "HCC-Production-Webhooks/1", "X-HCC-Event": d.event, "X-HCC-Delivery": d.id, "X-HCC-Signature": sign(secret, body) },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      code = res.status;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 300) : "Request failed";
    }
    const attempts = d.attempts + 1;
    if (!error) {
      await db.update(webhookDeliveries).set({ status: "success", attempts, lastStatusCode: code, lastError: null, deliveredAt: new Date() }).where(eq(webhookDeliveries.id, d.id));
    } else {
      const wait = BACKOFF[attempts - 1];
      await db
        .update(webhookDeliveries)
        .set({ status: wait === undefined ? "failed" : "pending", attempts, lastStatusCode: code, lastError: error, nextAttemptAt: new Date(now.getTime() + (wait ?? 0) * 60_000) })
        .where(eq(webhookDeliveries.id, d.id));
    }
  }
  return due.length;
}
