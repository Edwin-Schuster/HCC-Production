/**
 * Moves everything from the original HCC app into this one: users (with their passwords), the roster, SOPs,
 * projects, tasks, cabling, layouts, purchasing, contractors, gear, photos and every uploaded file.
 *
 *   npm run import:legacy -- /path/to/old/data          (the folder holding hcc.db and uploads/)
 *   npm run import:legacy -- /path/to/old/data --users-only
 *
 * Safe to re-run: anything already imported is skipped, so a second run only brings across what's new.
 */
import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { createDb } from "@/db";
import { legacyIds, sops } from "@/db/schema";
import { bootstrap } from "@/server/bootstrap";
import { importLegacy, readLegacyFolder } from "@/server/import/legacy";

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  const usersOnly = args.includes("--users-only");
  const force = args.includes("--force");
  if (!target) throw new Error("Usage: import-legacy /path/to/old/data [--users-only] [--force]");
  const dir = fs.statSync(target).isDirectory() ? target : path.dirname(target);
  const dbFile = fs.statSync(target).isDirectory() ? path.join(target, "hcc.db") : target;
  if (!fs.existsSync(dbFile)) throw new Error(`No hcc.db in ${dir}.`);
  const uploads = path.join(dir, "uploads");
  if (!usersOnly && !fs.existsSync(uploads)) console.warn(`No uploads folder at ${uploads}: files and images will be listed as missing.`);

  const src = await readLegacyFolder(dbFile, uploads);
  if (usersOnly) src.docs = {};
  const { db, close } = await createDb();
  try {
    // Refuse to mix the old data into the demo content a fresh install starts with, unless asked to.
    const [{ n: existingSops }] = await db.select({ n: sql<number>`count(*)::int` }).from(sops);
    const [{ n: imported }] = await db.select({ n: sql<number>`count(*)::int` }).from(legacyIds).where(eq(legacyIds.collection, "sops"));
    if (!usersOnly && existingSops > 0 && imported === 0 && !force) {
      throw new Error(
        "This app already has SOPs (probably the demo content). Import into a fresh database (start it once with SEED_DEMO=false), or pass --force to add the old data alongside.",
      );
    }
    console.log(`Importing from ${dir}…`);
    const { warnings } = await importLegacy(db, src, (line) => console.log(line));
    await bootstrap(db, { quiet: true });
    if (warnings.length) console.log(`Finished with ${warnings.length} note(s) above.`);
    else console.log("Finished.");
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
