"use client";

import { MapPin } from "lucide-react";
import Link from "next/link";
import { Ago, useNow } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import { PERSON_STATUS_LABEL } from "@/lib/roster";
import type { RosterPerson } from "@/server/services/roster";
import { StatusDot } from "./badges";

/** "Good morning, Edwin" in the reader's own time of day. */
export function Greeting({ name }: { name: string }) {
  const now = useNow();
  const first = name.split(/\s+/)[0];
  if (now === null) return <>Hello, {first}</>;
  const h = new Date(now).getHours();
  return (
    <>
      {h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, {first}
    </>
  );
}

export function CheckInCard({ me }: { me: RosterPerson | null }) {
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-[12px] border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">Your status</p>
        {me ? (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[14px]">
            <StatusDot status={me.status} />
            <b className="font-[510] text-fg-hi">{PERSON_STATUS_LABEL[me.status]}</b>
            {me.statusNote && <span className="text-fg-2">— {me.statusNote}</span>}
            <span className="text-xs text-muted">
              · checked in <Ago iso={me.lastCheckIn} />
            </span>
          </p>
        ) : (
          <p className="mt-0.5 text-[13px] text-muted">Your account isn&apos;t linked to the roster yet.</p>
        )}
      </div>
      {me && (
        <Button asChild variant="primary">
          <Link href="/roster?checkin=1">
            <MapPin /> Check in
          </Link>
        </Button>
      )}
    </section>
  );
}
