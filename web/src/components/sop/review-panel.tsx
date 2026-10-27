"use client";

import { CheckCircle2, GitCompare, PencilLine, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { decideAction } from "@/app/actions/approvals";
import type { ApprovalState } from "@/server/services/approvals";
import { LocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Approvals on a draft: who has signed off, and Approve / Request changes for reviewers. */
export function ReviewPanel({ sopId, state, compareHref, lastEditorName }: { sopId: string; state: ApprovalState; compareHref: string | null; lastEditorName: string | null }) {
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const submit = (decision: "approved" | "changes_requested") =>
    start(async () => {
      const res = await decideAction(sopId, { decision, comment, draftUpdatedAt: state.draftUpdatedAt! });
      if (!res.ok) return void toast.error(res.error);
      setComment("");
      toast(decision === "approved" ? "Approved" : "Changes requested");
    });
  const ready = state.validApprovals >= state.required;
  return (
    <section id="review" className="mt-6 scroll-mt-24 rounded-[12px] border border-line bg-surface px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="size-4 text-muted" aria-hidden />
        <h2 className="text-[14px] font-[510] text-fg-hi">Approval</h2>
        <span className={cn("rounded-[4px] px-1.5 font-mono text-xs leading-[18px]", ready ? "bg-good-soft text-good" : "bg-wash text-fg-2")}>
          {state.validApprovals} of {state.required}
        </span>
        <span className="flex-1" />
        {compareHref && (
          <Button asChild size="sm" variant="ghost">
            <Link href={compareHref}>
              <GitCompare /> What changed
            </Link>
          </Button>
        )}
      </div>
      <p className="mt-1 text-[13px] text-muted">
        {ready ? "This draft has the approvals it needs and can be published." : `Needs ${state.required - state.validApprovals} more approval${state.required - state.validApprovals === 1 ? "" : "s"} from an editor other than the last person to change it${lastEditorName ? ` (${lastEditorName})` : ""}.`}{" "}
        Any edit to the draft clears earlier approvals.
      </p>
      {state.decisions.length > 0 && (
        <ul className="mt-3 grid gap-2" role="list">
          {state.decisions.map((d) => (
            <li key={d.userId} className={cn("flex gap-2.5 text-[13.5px]", !d.current && "opacity-60")}>
              {d.decision === "approved" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-hidden /> : <PencilLine className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />}
              <div className="min-w-0">
                <span className="font-[510] text-fg-hi">{d.name}</span> <span className="text-muted">{d.decision === "approved" ? "approved" : "asked for changes"}</span>{" "}
                <span className="text-xs text-faint">
                  <LocalDate iso={d.createdAt} withTime />
                  {!d.current && " · on an earlier draft"}
                </span>
                {d.comment && <p className="mt-0.5 whitespace-pre-line text-fg-2">{d.comment}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {state.canApprove && (
        <div className="mt-4 grid gap-2 border-t border-line pt-4">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={2000} placeholder="Comment (required when asking for changes)" aria-label="Review comment" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" disabled={pending || !comment.trim()} onClick={() => submit("changes_requested")}>
              <PencilLine /> Request changes
            </Button>
            <Button size="sm" variant="primary" disabled={pending} onClick={() => submit("approved")}>
              <CheckCircle2 /> Approve
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
