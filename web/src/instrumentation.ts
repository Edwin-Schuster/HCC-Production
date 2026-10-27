/** Migrate the database and run first-start setup before the server takes requests. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { getDb } = await import("./db");
  await getDb();
}
