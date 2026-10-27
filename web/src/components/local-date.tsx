"use client";

import { useSyncExternalStore } from "react";
import { formatDate, formatDateTime } from "@/lib/format";

const noop = () => () => {};

/**
 * A date in the reader's own time zone. The server renders it in APP_TIMEZONE; after hydration the
 * browser switches to the local zone (useSyncExternalStore avoids a hydration mismatch).
 */
export function LocalDate({ iso, withTime = false, className }: { iso: string | null | undefined; withTime?: boolean; className?: string }) {
  const fmt = withTime ? formatDateTime : formatDate;
  const text = useSyncExternalStore(
    noop,
    () => (iso ? new Intl.DateTimeFormat("en-US", withTime ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "—"),
    () => fmt(iso),
  );
  if (!iso) return <span className={className}>—</span>;
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
