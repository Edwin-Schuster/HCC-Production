import "server-only";
import { connection, NextResponse } from "next/server";
import { ZodError } from "zod";
import type { DB } from "@/db";
import { getContext } from "@/server/context";
import { toPublicError } from "@/server/errors";
import type { Actor } from "@/server/permissions";

/**
 * Wraps a REST API route: resolves the caller (API key or session), returns JSON, and maps errors to
 * { error, code } with the right status. Permission checks stay in the services.
 */
export function api<C>(fn: (ctx: { db: DB; actor: Actor; req: Request; route: C }) => Promise<unknown>) {
  return async (req: Request, route: C) => {
    // API responses are always per request; saying so first keeps the build from trying to prerender them.
    await connection();
    try {
      const { db, actor } = await getContext();
      const out = await fn({ db, actor, req, route });
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof SyntaxError) return NextResponse.json({ error: "The request body isn't valid JSON.", code: "invalid" }, { status: 400 });
      if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid input", code: "invalid", issues: e.issues }, { status: 400 });
      const p = toPublicError(e);
      return NextResponse.json({ error: p.message, code: p.code }, { status: p.status });
    }
  };
}

export async function body(req: Request): Promise<unknown> {
  return req.json();
}
