const TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE || undefined;

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatDate(iso, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function relative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = (now - new Date(iso).getTime()) / 1000;
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return formatDate(iso);
}

export function daysUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - now) / 864e5);
}

/** A calendar date (YYYY-MM-DD), shown as-is whatever the time zone. */
export function formatDay(day: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  if (!day) return "—";
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

export const formatMoney = (cents: number, opts: { cents?: boolean } = {}) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : 0 });
