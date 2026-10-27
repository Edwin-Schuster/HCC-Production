import crypto from "node:crypto";

// Same format as the original HCC app (scrypt:salt:hash), so existing passwords keep working after import.
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt:${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}

export function checkPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
