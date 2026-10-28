import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/db";
import { users, workspaces } from "@/db/schema";
import { forbidden, invalid } from "@/server/errors";
import type { Actor } from "@/server/permissions";

/**
 * Phone notifications through ntfy (https://ntfy.sh or a self-hosted server). Each person subscribes to their
 * own topic in the ntfy app; anything that lands in their inbox is also pushed there. Best effort: a slow or
 * failing ntfy server never blocks or breaks the action that caused the notification.
 */

export const TOPIC = /^[A-Za-z0-9_-]{6,64}$/;
const enabled = () => process.env.DISABLE_PUSH !== "true" && process.env.NODE_ENV !== "test";

type Message = { title: string; body?: string; link?: string };

async function publish(server: string, topic: string, m: Message, appUrl: string) {
  const res = await fetch(server, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, title: m.title.slice(0, 250), message: (m.body || m.title).slice(0, 1000), ...(m.link && appUrl ? { click: appUrl + m.link } : {}), tags: ["bell"] }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`ntfy answered ${res.status}`);
}

async function target(db: Executor, workspaceId: string) {
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return { server: (ws?.settings?.ntfyServer || "https://ntfy.sh").replace(/\/+$/, ""), appUrl: (ws?.settings?.appUrl || process.env.APP_URL || "").replace(/\/+$/, "") };
}

/** Pushes to everyone in userIds who has a topic. Never throws. */
export async function sendPush(db: Executor, workspaceId: string, userIds: string[], m: Message) {
  if (!enabled() || !userIds.length) return;
  try {
    const rows = await db
      .select({ topic: users.ntfyTopic })
      .from(users)
      .where(and(inArray(users.id, userIds), isNotNull(users.ntfyTopic), eq(users.disabled, false)));
    if (!rows.length) return;
    const { server, appUrl } = await target(db, workspaceId);
    await Promise.allSettled(rows.map((r) => publish(server, r.topic!, m, appUrl).catch((e) => console.warn("Push failed:", e instanceof Error ? e.message : e))));
  } catch (e) {
    console.warn("Push failed:", e);
  }
}

export const TopicInput = z.object({ topic: z.union([z.literal(""), z.string().trim().regex(TOPIC, "Use 6–64 letters, numbers, - or _")]) });

export async function setNtfyTopic(db: Executor, actor: Actor, input: z.input<typeof TopicInput>) {
  if (!actor.userId) throw forbidden("Sign in first.");
  const { topic } = TopicInput.parse(input);
  await db.update(users).set({ ntfyTopic: topic || null }).where(eq(users.id, actor.userId));
}

export async function getNtfyTopic(db: Executor, actor: Actor) {
  if (!actor.userId) return null;
  const [u] = await db.select({ topic: users.ntfyTopic }).from(users).where(eq(users.id, actor.userId)).limit(1);
  return u?.topic ?? null;
}

/** Sends a test push and reports any error, so people can check their setup. */
export async function testPush(db: Executor, actor: Actor) {
  const topic = await getNtfyTopic(db, actor);
  if (!topic) throw invalid("Save a topic first.");
  const { server, appUrl } = await target(db, actor.workspaceId);
  try {
    await publish(server, topic, { title: "Test from HCC Production", body: "Phone notifications are working.", link: "/inbox" }, appUrl);
  } catch (e) {
    throw invalid(`Couldn't reach ${server}: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  return { server };
}
