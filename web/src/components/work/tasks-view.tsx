"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Download, GanttChart, KanbanSquare, List, MessageSquare, Paperclip, Plus, Search, SquareCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useOptimistic, useState, useTransition, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { createTaskAction, moveTaskAction, updateTaskAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { CopyButton } from "@/components/copy-button";
import { formatDay } from "@/lib/format";
import { PRIORITIES, PRIORITY_LABEL, PRIORITY_RANK, TASK_STATUSES, TASK_STATUS_LABEL, addDays, isOverdue, type Priority, type TaskStatus } from "@/lib/work";
import { cn } from "@/lib/utils";
import type { TaskView } from "@/server/services/tasks";
import { Avatar, LabelChip, PriorityBadge, TaskStatusBadge } from "./badges";
import { Gantt } from "./gantt";
import { TaskDrawer, type OpenTask } from "./task-drawer";

export type TaskViewMode = "list" | "board" | "calendar" | "timeline";
export type Member = { id: string; name: string; username: string };

type Filters = { q: string; who: string; priority: string; label: string; showDone: boolean };
type Change = { id: string; patch: Partial<TaskView> } | { id: string; move: { status: TaskStatus; index: number } };

const PRIORITY_BAR: Record<Priority, string> = { urgent: "bg-bad", high: "bg-warn", medium: "bg-line-2", low: "bg-line" };
const PRIORITY_COLOR: Record<Priority, string> = { urgent: "var(--color-bad)", high: "var(--color-warn)", medium: "var(--color-iris)", low: "var(--color-line-2)" };

function applyChange(tasks: TaskView[], c: Change): TaskView[] {
  if ("patch" in c) return tasks.map((t) => (t.id === c.id ? { ...t, ...c.patch } : t));
  const moving = tasks.find((t) => t.id === c.id);
  if (!moving) return tasks;
  const column = tasks.filter((t) => t.status === c.move.status && !t.parentId && t.id !== c.id).sort((a, b) => a.position - b.position);
  column.splice(Math.min(c.move.index, column.length), 0, { ...moving, status: c.move.status });
  const pos = new Map(column.map((t, i) => [t.id, i + 1]));
  return tasks.map((t) => (t.id === c.id ? { ...t, status: c.move.status, position: pos.get(t.id)! } : pos.has(t.id) ? { ...t, position: pos.get(t.id)! } : t));
}

export function TasksView({
  projectId,
  projectName,
  tasks: serverTasks,
  members,
  view,
  open,
  today,
  calendarFeed,
  selfId,
}: {
  projectId: string;
  projectName: string;
  tasks: TaskView[];
  members: Member[];
  view: TaskViewMode;
  open: OpenTask | null;
  today: string;
  calendarFeed: string | null;
  selfId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tasks, apply] = useOptimistic(serverTasks, applyChange);
  const [filters, setFilters] = useState<Filters>({ q: "", who: "", priority: "", label: "", showDone: false });
  const [creating, setCreating] = useState<Partial<TaskView> | null>(null);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const labels = [...new Set(tasks.flatMap((t) => t.labels))].sort((a, b) => a.localeCompare(b));

  // The open task, tracked here so closing the drawer is instant and a quick view switch can't reopen it.
  const [taskId, setTaskId] = useState(open?.task.id ?? null);
  const [seen, setSeen] = useState(open?.task.id ?? null);
  if ((open?.task.id ?? null) !== seen) {
    setSeen(open?.task.id ?? null);
    setTaskId(open?.task.id ?? null);
  }
  const go = (params: { view?: TaskViewMode; task?: string | null }) => {
    const sp = new URLSearchParams();
    const v = params.view ?? view;
    if (v !== "list") sp.set("view", v);
    const t = params.task === undefined ? taskId : params.task;
    if (params.task !== undefined) setTaskId(params.task);
    if (t) sp.set("task", t);
    router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
  };
  const openTask = (id: string) => go({ task: id });

  const change = (c: Change, action: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      apply(c);
      const res = await action();
      if (!res.ok) toast.error(res.error ?? "Couldn't save that");
    });
  const patch = (id: string, p: Partial<TaskView>) => change({ id, patch: p }, () => updateTaskAction(id, p as never));
  const toggleDone = (t: TaskView) => patch(t.id, { status: t.status === "done" ? "todo" : "done" });
  const move = (id: string, status: TaskStatus, index: number) => change({ id, move: { status, index } }, () => moveTaskAction(id, status, index));

  const q = filters.q.trim().toLowerCase();
  const visible = tasks.filter((t) => {
    if (!filters.showDone && t.status === "done" && view !== "board") return false;
    if (filters.who && !t.assignees.includes(filters.who)) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.label && !t.labels.includes(filters.label)) return false;
    if (q && !`${t.title} ${t.description} ${t.labels.join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const ctx: Ctx = { tasks, visible, names, today, openTask, toggleDone, move, patch, newTask: (p) => setCreating(p) };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-[6px] border border-line p-0.5" role="group" aria-label="View">
          {(
            [
              ["list", "List", <List key="l" />],
              ["board", "Board", <KanbanSquare key="b" />],
              ["calendar", "Calendar", <CalendarDays key="c" />],
              ["timeline", "Timeline", <GanttChart key="t" />],
            ] as [TaskViewMode, string, ReactNode][]
          ).map(([k, label, icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => go({ view: k })}
              aria-pressed={view === k}
              className={cn("flex items-center gap-1.5 rounded-[4px] px-2 py-1 text-[12.5px] [&_svg]:size-3.5", view === k ? "bg-wash text-fg-hi" : "text-muted hover:text-fg-hi")}
            >
              {icon}
              <span className="max-sm:sr-only">{label}</span>
            </button>
          ))}
        </div>
        <label className="relative min-w-40 flex-1 sm:max-w-60">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <Input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Filter tasks" aria-label="Filter tasks" className="h-8 pl-8" />
        </label>
        <Select value={filters.who} onChange={(e) => setFilters({ ...filters, who: e.target.value })} aria-label="Assignee" className="h-8 w-auto max-w-44 md:text-[13px]">
          <option value="">Anyone</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === selfId ? `${m.name} (me)` : m.name}
            </option>
          ))}
        </Select>
        <Select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} aria-label="Priority" className="h-8 w-auto max-w-44 md:text-[13px]">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
        {labels.length > 0 && (
          <Select value={filters.label} onChange={(e) => setFilters({ ...filters, label: e.target.value })} aria-label="Label" className="h-8 w-auto max-w-44 md:text-[13px]">
            <option value="">Any label</option>
            {labels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
        )}
        {view !== "board" && (
          <label className="flex items-center gap-1.5 text-[12.5px] text-fg-2">
            <input type="checkbox" checked={filters.showDone} onChange={(e) => setFilters({ ...filters, showDone: e.target.checked })} className="accent-[var(--color-cta)]" /> Show done
          </label>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => downloadCsv(projectName, visible, tasks, names)}>
          <Download /> CSV
        </Button>
        <Button size="sm" variant="primary" onClick={() => setCreating({})}>
          <Plus /> Task
        </Button>
      </div>

      {view === "list" && <ListView ctx={ctx} projectId={projectId} />}
      {view === "board" && <BoardView ctx={ctx} />}
      {view === "calendar" && <CalendarView ctx={ctx} feed={calendarFeed} />}
      {view === "timeline" && <TimelineView ctx={ctx} />}

      <NewTaskDialog projectId={projectId} initial={creating} members={members} onClose={() => setCreating(null)} onCreated={openTask} />
      <TaskDrawer key={open?.task.id} open={open && open.task.id === taskId ? open : null} members={members} selfId={selfId} today={today} onClose={() => go({ task: null })} onOpen={openTask} />
    </>
  );
}

type Ctx = {
  tasks: TaskView[];
  visible: TaskView[];
  names: Map<string, string>;
  today: string;
  openTask: (id: string) => void;
  toggleDone: (t: TaskView) => void;
  move: (id: string, status: TaskStatus, index: number) => void;
  patch: (id: string, p: Partial<TaskView>) => void;
  newTask: (p: Partial<TaskView>) => void;
};

function Meta({ t, ctx }: { t: TaskView; ctx: Ctx }) {
  const subs = ctx.tasks.filter((s) => s.parentId === t.id);
  const done = subs.filter((s) => s.status === "done").length;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted [&_svg]:size-3">
      {t.labels.map((l) => (
        <LabelChip key={l} label={l} />
      ))}
      {subs.length > 0 && (
        <span className="flex items-center gap-0.5" title="Subtasks">
          <SquareCheck /> {done}/{subs.length}
        </span>
      )}
      {t.attachments.length > 0 && (
        <span className="flex items-center gap-0.5" title="Attachments">
          <Paperclip /> {t.attachments.length}
        </span>
      )}
      {t.commentCount > 0 && (
        <span className="flex items-center gap-0.5" title="Comments">
          <MessageSquare /> {t.commentCount}
        </span>
      )}
    </span>
  );
}

function Assignees({ ids, names }: { ids: string[]; names: Map<string, string> }) {
  return (
    <span className="flex -space-x-1.5">
      {ids.filter((u) => names.has(u)).map((u) => (
        <Avatar key={u} name={names.get(u)!} size="xs" />
      ))}
    </span>
  );
}

function DoneBox({ t, onToggle, small }: { t: TaskView; onToggle: () => void; small?: boolean }) {
  const done = t.status === "done";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${done ? "Mark not done" : "Mark done"}: ${t.title}`}
      onClick={onToggle}
      className={cn("grid shrink-0 place-items-center rounded-full border transition-colors", small ? "size-4" : "size-[18px]", done ? "border-good bg-good text-bg" : "border-line-2 hover:border-fg-2")}
    >
      {done && (
        <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
          <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function ListView({ ctx, projectId }: { ctx: Ctx; projectId: string }) {
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  const ids = new Set(ctx.visible.map((t) => t.id));
  const top = ctx.visible.filter((t) => !t.parentId || !ids.has(t.parentId));
  const sort = (a: TaskView, b: TaskView) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.due ?? "9").localeCompare(b.due ?? "9") || a.position - b.position;
  const groups = TASK_STATUSES.map((s) => [s, top.filter((t) => t.status === s).sort(sort)] as const).filter(([, ts]) => ts.length);

  const row = (t: TaskView, depth = 0): ReactNode => (
    <div key={t.id}>
      <div className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0 hover:bg-wash-2" style={{ paddingLeft: 12 + depth * 22 }}>
        <DoneBox t={t} onToggle={() => ctx.toggleDone(t)} />
        <button type="button" onClick={() => ctx.openTask(t.id)} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
          <span className={cn("max-w-full truncate text-[13.5px] text-fg-hi", t.status === "done" && "text-muted line-through")}>{t.title}</span>
          <Meta t={t} ctx={ctx} />
        </button>
        <Assignees ids={t.assignees} names={ctx.names} />
        <span className={cn("hidden w-14 text-right font-mono text-xs sm:block", isOverdue(t, ctx.today) ? "text-bad" : "text-muted")}>{t.due ? formatDay(t.due, { month: "short", day: "numeric" }) : ""}</span>
        <span className="hidden w-16 sm:block">
          <PriorityBadge priority={t.priority} />
        </span>
      </div>
      {ctx.visible
        .filter((s) => s.parentId === t.id)
        .sort(sort)
        .map((s) => row(s, depth + 1))}
    </div>
  );

  return (
    <>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          start(async () => {
            const res = await createTaskAction({ projectId, title });
            if (res.ok) setTitle("");
            else toast.error(res.error);
          });
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task and press Enter…" aria-label="New task title" autoComplete="off" />
        <Button type="submit" disabled={pending || !title.trim()}>
          Add
        </Button>
      </form>
      {groups.length ? (
        <div className="grid gap-5">
          {groups.map(([s, ts]) => (
            <section key={s} aria-label={TASK_STATUS_LABEL[s]}>
              <h3 className="mb-1.5 flex items-center gap-2 text-xs">
                <TaskStatusBadge status={s} />
                <span className="text-muted">{ts.length}</span>
              </h3>
              <div className="overflow-hidden rounded-[12px] border border-line bg-surface">{ts.map((t) => row(t))}</div>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-[12px] border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted">{ctx.tasks.length ? "No tasks match these filters." : "No tasks yet. Add the first one above."}</p>
      )}
    </>
  );
}

function BoardView({ ctx }: { ctx: Ctx }) {
  const [drag, setDrag] = useState<{ id: string; status: TaskStatus; index: number } | null>(null);
  const top = ctx.visible.filter((t) => !t.parentId);
  const column = (s: TaskStatus) => top.filter((t) => t.status === s).sort((a, b) => a.position - b.position);

  const overCard = (e: DragEvent, s: TaskStatus, i: number) => {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const index = e.clientY > r.top + r.height / 2 ? i + 1 : i;
    if (drag && (drag.status !== s || drag.index !== index)) setDrag({ ...drag, status: s, index });
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    if (!drag) return;
    // The index counts the dragged card itself if it's above the drop point in the same column.
    const col = column(drag.status);
    const from = col.findIndex((t) => t.id === drag.id);
    ctx.move(drag.id, drag.status, from >= 0 && from < drag.index ? drag.index - 1 : drag.index);
    setDrag(null);
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[1080px] grid-cols-6 gap-3">
        {TASK_STATUSES.map((s, ci) => {
          const ts = column(s);
          return (
            <section
              key={s}
              aria-label={TASK_STATUS_LABEL[s]}
              className={cn("flex min-h-40 flex-col rounded-[12px] border border-line bg-surface/60 p-2", drag?.status === s && "border-line-2 bg-wash-2")}
              onDragOver={(e) => {
                e.preventDefault();
                if (drag && drag.status !== s && !ts.length) setDrag({ ...drag, status: s, index: 0 });
              }}
              onDrop={drop}
            >
              <header className="mb-2 flex items-center gap-2 px-1">
                <TaskStatusBadge status={s} />
                <span className="text-xs text-muted">{ts.length}</span>
                <span className="flex-1" />
                <Button size="icon-sm" variant="ghost" aria-label={`Add task to ${TASK_STATUS_LABEL[s]}`} onClick={() => ctx.newTask({ status: s })}>
                  <Plus />
                </Button>
              </header>
              <div className="grid gap-2">
                {ts.map((t, i) => (
                  <article
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", t.id);
                      setDrag({ id: t.id, status: s, index: i });
                    }}
                    onDragEnd={() => setDrag(null)}
                    onDragOver={(e) => overCard(e, s, i)}
                    className={cn(
                      "relative cursor-grab overflow-hidden rounded-[8px] border border-line bg-surface-2 p-2.5 pl-3 active:cursor-grabbing",
                      drag?.id === t.id && "opacity-40",
                      drag && drag.id !== t.id && drag.status === s && drag.index === i && "shadow-[0_-2px_0_var(--color-cta)]",
                      drag && drag.id !== t.id && drag.status === s && drag.index === i + 1 && i === ts.length - 1 && "shadow-[0_2px_0_var(--color-cta)]",
                    )}
                    data-testid="board-card"
                  >
                    <span className={cn("absolute inset-y-0 left-0 w-0.5", PRIORITY_BAR[t.priority])} aria-hidden />
                    <button type="button" onClick={() => ctx.openTask(t.id)} className="flex w-full flex-col items-start gap-1 text-left">
                      <span className="text-[13px] text-fg-hi">{t.title}</span>
                      <Meta t={t} ctx={ctx} />
                    </button>
                    <footer className="mt-2 flex items-center gap-2">
                      <Assignees ids={t.assignees} names={ctx.names} />
                      <span className={cn("font-mono text-[11px]", isOverdue(t, ctx.today) ? "text-bad" : "text-muted")}>{t.due ? formatDay(t.due, { month: "short", day: "numeric" }) : ""}</span>
                      <span className="flex-1" />
                      {ci < TASK_STATUSES.length - 1 && (
                        <Button size="icon-sm" variant="ghost" className="size-6" aria-label={`Move to ${TASK_STATUS_LABEL[TASK_STATUSES[ci + 1]]}`} title={`Move to ${TASK_STATUS_LABEL[TASK_STATUSES[ci + 1]]}`} onClick={() => ctx.move(t.id, TASK_STATUSES[ci + 1], 0)}>
                          <ChevronRight />
                        </Button>
                      )}
                    </footer>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CalendarView({ ctx, feed }: { ctx: Ctx; feed: string | null }) {
  const [month, setMonth] = useState(ctx.today.slice(0, 7));
  const [syncing, setSyncing] = useState(false);
  const first = `${month}-01`;
  const startDow = new Date(`${first}T00:00:00Z`).getUTCDay();
  const daysIn = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(startDow).fill(null), ...Array.from({ length: daysIn }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const byDay = new Map<string, TaskView[]>();
  for (const t of ctx.visible) if (t.due) byDay.set(t.due, [...(byDay.get(t.due) ?? []), t]);
  const shift = (n: number) => {
    const d = new Date(`${first}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="ghost" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <h3 className="min-w-36 text-center text-[15px] font-[510]">{formatDay(first, { month: "long", year: "numeric" })}</h3>
        <Button size="icon-sm" variant="ghost" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMonth(ctx.today.slice(0, 7))}>
          Today
        </Button>
        <span className="flex-1" />
        <Button size="sm" onClick={() => setSyncing(true)}>
          <CalendarDays /> Sync to my calendar
        </Button>
      </div>
      <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
        <div className="grid grid-cols-7 border-b border-line text-center text-[11px] text-muted">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => (
            <div key={d ?? `x${i}`} className={cn("min-h-20 border-b border-r border-line/70 p-1 [&:nth-child(7n)]:border-r-0 sm:min-h-24", !d && "bg-wash-2")}>
              {d && (
                <>
                  <button
                    type="button"
                    onClick={() => ctx.newTask({ due: d })}
                    aria-label={`Add a task due ${formatDay(d)}`}
                    className={cn("grid size-6 place-items-center rounded-full font-mono text-[11px] text-muted hover:bg-wash hover:text-fg-hi", d === ctx.today && "bg-cta font-[510] text-cta-ink hover:bg-cta-hover hover:text-cta-ink")}
                  >
                    {Number(d.slice(8))}
                  </button>
                  <div className="mt-0.5 grid gap-0.5">
                    {(byDay.get(d) ?? []).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => ctx.openTask(t.id)}
                        className={cn("truncate rounded-[3px] border-l-2 bg-wash px-1 text-left text-[11px] leading-[18px] text-fg-2 hover:bg-wash-2 hover:text-fg-hi", t.status === "done" && "text-muted line-through")}
                        style={{ borderLeftColor: PRIORITY_COLOR[t.priority] }}
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-faint">Tap a date to add a task due that day.</p>
      <Dialog open={syncing} onOpenChange={setSyncing}>
        <DialogContent title="Sync to my calendar" description="Subscribe once and tasks' due dates and project dates show up in your phone's calendar.">
          {feed ? (
            <div className="grid gap-3 text-[13px]">
              <div className="flex items-center gap-2">
                <Input readOnly value={origin + feed} aria-label="Calendar feed address" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <CopyButton text={origin + feed} />
              </div>
              <ul className="list-disc space-y-1 pl-5 text-fg-2">
                <li>
                  <b className="font-[510]">iPhone:</b> Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar, and paste the address.
                </li>
                <li>
                  <b className="font-[510]">Google Calendar:</b> Other calendars → + → From URL.
                </li>
                <li>
                  <b className="font-[510]">Outlook:</b> Add calendar → Subscribe from web.
                </li>
              </ul>
              <p className="text-xs text-muted">Anyone with this address can see task titles and dates, so keep it to the team. An admin can change it under Integrations.</p>
              <Button asChild size="sm" className="justify-self-start">
                <a href={feed.replace(/^\//, "webcal://" + (typeof window === "undefined" ? "" : window.location.host) + "/")}>Open in my calendar app</a>
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-fg-2">The calendar feed is off. An admin can turn it on under <b className="font-[510]">Integrations</b>.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TimelineView({ ctx }: { ctx: Ctx }) {
  const rows: Parameters<typeof Gantt>[0]["rows"] = [];
  const add = (t: TaskView, depth: number) => {
    if (t.start || t.due) {
      const start = t.start ?? t.due!;
      const end = t.due && t.due >= start ? t.due : start;
      rows.push({ id: t.id, name: t.title, start, end, color: PRIORITY_COLOR[t.priority], done: t.status === "done", depth, onOpen: () => ctx.openTask(t.id) });
    }
    ctx.visible.filter((s) => s.parentId === t.id).forEach((s) => add(s, depth + 1));
  };
  ctx.visible
    .filter((t) => !t.parentId)
    .sort((a, b) => (a.start ?? a.due ?? "9").localeCompare(b.start ?? b.due ?? "9"))
    .forEach((t) => add(t, 0));
  if (!rows.length) return <p className="rounded-[12px] border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted">Give tasks a start or due date to place them on the timeline.</p>;
  return <Gantt rows={rows} today={ctx.today} label="Task timeline" />;
}

function NewTaskDialog({ projectId, initial, members, onClose, onCreated }: { projectId: string; initial: Partial<TaskView> | null; members: Member[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [pending, start] = useTransition();
  return (
    <Dialog open={initial !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="New task">
        {initial && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const s = (k: string) => String(fd.get(k) ?? "");
              start(async () => {
                const res = await createTaskAction({
                  projectId,
                  title: s("title"),
                  status: s("status") as TaskStatus,
                  priority: s("priority") as Priority,
                  due: s("due") || null,
                  start: s("start") || null,
                  assignees: fd.getAll("assignees").map(String),
                });
                if (!res.ok) return void toast.error(res.error);
                onClose();
                onCreated(res.data.id);
              });
            }}
          >
            <Field label="Title" htmlFor="nt-title">
              <Input id="nt-title" name="title" required autoFocus maxLength={300} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Status" htmlFor="nt-status">
                <Select id="nt-status" name="status" defaultValue={initial.status ?? "todo"}>
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TASK_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority" htmlFor="nt-priority">
                <Select id="nt-priority" name="priority" defaultValue="medium">
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Start" htmlFor="nt-start">
                <Input id="nt-start" name="start" type="date" />
              </Field>
              <Field label="Due" htmlFor="nt-due">
                <Input id="nt-due" name="due" type="date" defaultValue={initial.due ?? ""} />
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-xs font-[510] text-muted">Assignees</legend>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-xs text-fg-2 has-[:checked]:border-fg-2 has-[:checked]:bg-wash has-[:checked]:text-fg-hi">
                    <input type="checkbox" name="assignees" value={m.id} className="sr-only" />
                    <Avatar name={m.name} size="xs" /> {m.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                Create task
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function downloadCsv(projectName: string, rows: TaskView[], all: TaskView[], names: Map<string, string>) {
  const title = new Map(all.map((t) => [t.id, t.title]));
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    // Leading = + - @ would run as a formula in a spreadsheet.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [
    ["Title", "Status", "Priority", "Assignees", "Labels", "Start", "Due", "Parent task", "Completed"],
    ...rows.map((t) => [t.title, TASK_STATUS_LABEL[t.status], PRIORITY_LABEL[t.priority], t.assignees.map((u) => names.get(u) ?? "").filter(Boolean).join("; "), t.labels.join("; "), t.start ?? "", t.due ?? "", t.parentId ? (title.get(t.parentId) ?? "") : "", t.completedAt?.slice(0, 10) ?? ""]),
  ];
  const blob = new Blob([lines.map((l) => l.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${projectName.replace(/[^\w-]+/g, "-").toLowerCase()}-tasks.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
