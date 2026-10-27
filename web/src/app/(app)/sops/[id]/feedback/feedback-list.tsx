"use client";

import { Check, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resolveFeedbackAction } from "@/app/actions/discussion";
import type { FeedbackItem } from "@/server/services/feedback";
import { LocalDate } from "@/components/local-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

const TYPE = { unclear: "Unclear", wrong: "Wrong", other: "Other" } as const;

export function FeedbackList({ sopId, items, canEdit }: { sopId: string; items: FeedbackItem[]; canEdit: boolean }) {
  return (
    <ul role="list" className="grid gap-3">
      {items.map((f) => (
        <Item key={f.id} sopId={sopId} f={f} canEdit={canEdit} />
      ))}
    </ul>
  );
}

function Item({ sopId, f, canEdit }: { sopId: string; f: FeedbackItem; canEdit: boolean }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const resolve = (status: "accepted" | "rejected" | "open") =>
    start(async () => {
      const res = await resolveFeedbackAction(f.id, { status, note });
      if (!res.ok) toast.error(res.error);
    });
  return (
    <li className="rounded-[12px] border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={f.type === "wrong" ? "bad" : f.type === "unclear" ? "warn" : "neutral"}>{TYPE[f.type]}</Badge>
        <Link href={`/sops/${sopId}#k-${f.blockKey}`} className="min-w-0 flex-1 truncate text-[14px] text-fg-hi hover:underline">
          {f.blockLabel}
        </Link>
        {f.status !== "open" && <Badge tone={f.status === "accepted" ? "good" : "neutral"}>{f.status === "accepted" ? "Accepted" : "Rejected"}</Badge>}
      </div>
      {f.message && <p className="mt-2 whitespace-pre-line text-[14px] text-fg-2">{f.message}</p>}
      <p className="mt-1.5 text-xs text-faint">
        {f.userName} · <LocalDate iso={f.createdAt} withTime />
        {f.versionNumber ? ` · on v${f.versionNumber}` : ""}
        {f.resolvedByName && ` · ${f.status} by ${f.resolvedByName}`}
        {f.resolutionNote && `: “${f.resolutionNote}”`}
      </p>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {f.status === "open" ? (
            <>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reply to the reader (optional)" maxLength={2000} className="h-8 min-w-48 flex-1" />
              <Button size="sm" disabled={pending} onClick={() => resolve("rejected")}>
                <X /> It's correct
              </Button>
              <Button size="sm" variant="primary" disabled={pending} onClick={() => resolve("accepted")}>
                <Check /> Accept
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => resolve("open")}>
              <RotateCcw /> Reopen
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
