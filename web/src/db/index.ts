import path from "node:path";
import fs from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export { schema };

/** Works for both node-postgres and PGlite drivers. */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
/** A database handle or an open transaction. Services accept either. */
export type Executor = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];

type Holder = { db?: DB; ready?: Promise<DB>; close?: () => Promise<void> };
const g = globalThis as unknown as { __hccDb?: Holder };
const holder: Holder = (g.__hccDb ??= {});

const MIGRATIONS = process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");

/**
 * DATABASE_URL=postgres://... uses node-postgres.
 * DATABASE_URL=pglite://./.data/pglite (default) or pglite://memory uses embedded PGlite (dev/tests).
 */
export async function createDb(url = process.env.DATABASE_URL ?? "pglite://./.data/pglite"): Promise<{ db: DB; close: () => Promise<void> }> {
  if (url.startsWith("postgres")) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return { db: db as unknown as DB, close: () => pool.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = url.replace(/^pglite:\/\//, "");
  if (dir !== "memory") fs.mkdirSync(path.dirname(path.resolve(dir)), { recursive: true });
  const client = dir === "memory" ? new PGlite() : new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as DB, close: () => client.close() };
}

/** Shared app-wide connection, migrated on first use. */
export function getDb(): Promise<DB> {
  if (holder.db) return Promise.resolve(holder.db);
  holder.ready ??= createDb().then(async ({ db, close }) => {
    holder.db = db;
    holder.close = close;
    const { bootstrap } = await import("@/server/bootstrap");
    await bootstrap(db);
    return db;
  });
  return holder.ready;
}

/** Postgres error raised by the immutability triggers. */
export function isImmutableVersionError(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const c = cur as { hint?: string; cause?: unknown; message?: string };
    if (c.hint === "immutable_version" || /is immutable/.test(String(c.message))) return true;
    cur = c.cause;
  }
  return false;
}
