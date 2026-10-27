"use client";

import { useEffect } from "react";

/** Counts one read of an SOP when the page is actually shown. */
export function ViewBeacon({ sopId }: { sopId: string }) {
  useEffect(() => {
    void fetch(`/api/sops/${sopId}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [sopId]);
  return null;
}
