import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AtSign, Bell, CalendarClock, CheckCircle2, Flag, GraduationCap, MessageSquare, PencilLine, Send, ShieldCheck } from "lucide-react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { listNotifications } from "@/server/services/notifications";
import { Empty, Page, PageHeader } from "@/components/page";
import { LocalDate } from "@/components/local-date";
import { cn } from "@/lib/utils";
import { MarkAllRead } from "./mark-all-read";

export const metadata: Metadata = { title: "Inbox" };

const ICON: Record<string, typeof Bell> = {
  review_due: CalendarClock,
  review_overdue: CalendarClock,
  review_requested: ShieldCheck,
  approved: CheckCircle2,
  changes_requested: PencilLine,
  feedback: Flag,
  feedback_resolved: Flag,
  comment: MessageSquare,
  mention: AtSign,
  suggestion: PencilLine,
  suggestion_resolved: PencilLine,
  published: Send,
  training_assigned: GraduationCap,
  training_completed: GraduationCap,
};

export default function InboxPage() {
  return (
    <Page>
      <Suspense fallback={<div className="h-96" />}>
        <Inbox />
      </Suspense>
    </Page>
  );
}

async function Inbox() {
  const actor = await requireRole("viewer", "/inbox");
  const items = await listNotifications(await getDb(), actor, { limit: 100 });
  const unread = items.filter((i) => !i.read).length;
  return (
    <>
      <PageHeader title="Inbox" subtitle="Reviews, approvals, feedback and comments on SOPs you own or follow." actions={unread > 0 ? <MarkAllRead /> : null} />
      {items.length === 0 ? (
        <Empty title="Nothing here yet">You'll hear about reviews due, approval requests, feedback on your SOPs and @mentions.</Empty>
      ) : (
        <ul role="list" className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
          {items.map((n) => {
            const Icon = ICON[n.kind] ?? Bell;
            return (
              <li key={n.id}>
                <Link href={`/inbox/open/${n.id}`} prefetch={false} className={cn("flex gap-3 px-4 py-3 hover:bg-wash-2", !n.read && "bg-surface")}>
                  <Icon className={cn("mt-0.5 size-4 shrink-0", n.read ? "text-faint" : "text-fg-hi")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[14px]", n.read ? "text-fg-2" : "font-[510] text-fg-hi")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{n.body}</span>}
                    <span className="mt-1 block text-xs text-faint">
                      {n.actorName ? `${n.actorName} · ` : ""}
                      <LocalDate iso={n.createdAt} withTime />
                    </span>
                  </span>
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-cta" aria-label="Unread" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
