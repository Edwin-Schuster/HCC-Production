import "server-only";
import type { DB } from "@/db";
import { toPublicError } from "@/server/errors";
import { getContext } from "@/server/context";
import type { Actor } from "@/server/permissions";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; code: string };

/** Runs a service call as the current user and turns errors into a safe result for the client. */
export async function run<T>(fn: (db: DB, actor: Actor) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const { db, actor } = await getContext();
    return { ok: true, data: await fn(db, actor) };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e; // redirect/notFound
    const p = toPublicError(e);
    return { ok: false, error: p.message, code: p.code };
  }
}
