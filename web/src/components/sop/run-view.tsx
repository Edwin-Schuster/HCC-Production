"use client";

import { Check, CheckCircle2, Flag, MessageSquareText, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { checkStepAction, finishRunAction, noteStepAction } from "@/app/actions/runs";
import { SopBody } from "@/blocks/render";
import type { BlockNode } from "@/blocks/schema";
import type { RunStepState } from "@/server/services/runs";
import { LocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  run: { id: string; label: string; status: "in_progress" | "completed" | "abandoned"; startedAt: string; completedAt: string | null; startedByName: string; versionNumber: number };
  sop: { id: string; title: string; documentCode: string };
  blocks: BlockNode[];
  roles: Record<string, string>;
  snippets: Record<string, { name: string; version: number; pinned: boolean }>;
  checkableIds: string[];
  state: Record<string, RunStepState>;
  canFinish: boolean;
};

const tick = (cb: () => void) => {
  const t = setInterval(cb, 1000);
  return () => clearInterval(t);
};

function Elapsed({ from, to }: { from: string; to: string | null }) {
  const now = useSyncExternalStore(tick, () => Math.floor(Date.now() / 1000), () => Math.floor(Date.parse(from) / 1000));
  const secs = Math.max(0, (to ? Math.floor(Date.parse(to) / 1000) : now) - Math.floor(Date.parse(from) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return <span className="font-mono tabular-nums">{h ? `${h}:${String(m).padStart(2, "0")}` : m}:{String(s).padStart(2, "0")}</span>;
}

/** Working through an SOP: tick steps off as you go. Teammates' ticks appear within a few seconds. */
export function RunView(p: Props) {
  const router = useRouter();
  const live = p.run.status === "in_progress";
  const [state, setState] = useState(p.state);
  const [serverState, setServerState] = useState(p.state);
  const [finishing, setFinishing] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Fresh server data (from polling) replaces local state.
  if (p.state !== serverState) {
    setServerState(p.state);
    setState(p.state);
  }
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [live, router]);

  const done = p.checkableIds.filter((id) => state[id]?.completedAt).length;
  const total = p.checkableIds.length;
  const toggle = (blockId: string) => {
    if (!live) return;
    const next = !state[blockId]?.completedAt;
    setState((s) => ({ ...s, [blockId]: { blockId, completedAt: next ? new Date().toISOString() : null, completedByName: "You", skipped: false, note: s[blockId]?.note ?? "" } }));
    start(async () => {
      const res = await checkStepAction(p.run.id, { blockId, done: next });
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
      }
    });
  };

  const box = (id: string, label: string) => {
    const s = state[id];
    const checked = Boolean(s?.completedAt);
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`${checked ? "Untick" : "Tick"} ${label}`}
        disabled={!live}
        onClick={() => toggle(id)}
        title={s?.completedAt ? `Done by ${s.completedByName ?? "someone"}` : undefined}
        className={cn(
          "mt-[1px] flex h-[26px] min-w-[26px] shrink-0 items-center justify-center gap-1 rounded-full border px-1.5 font-mono text-xs tabular-nums transition-colors",
          checked ? "border-good bg-good text-bg" : s?.skipped ? "border-warn/60 text-warn" : "border-line-2 bg-surface-2 text-fg-hi hover:border-fg-2",
        )}
      >
        {checked ? <Check className="size-3.5" strokeWidth={3} /> : label}
      </button>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[820px] px-[max(16px,env(safe-area-inset-left))] pb-32 pt-4 sm:px-8">
      <div className="sticky top-12 z-10 -mx-4 mb-6 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:top-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <Link href={`/sops/${p.sop.id}`} className="font-mono text-xs text-muted hover:text-fg-hi">
              {p.sop.documentCode} · v{p.run.versionNumber}
            </Link>
            <h1 className="truncate text-[17px] font-[510] text-fg-hi">
              {p.sop.title}
              {p.run.label && <span className="text-muted"> · {p.run.label}</span>}
            </h1>
          </div>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <Timer className="size-3.5" /> <Elapsed from={p.run.startedAt} to={p.run.completedAt} />
          </span>
          {live && p.canFinish ? (
            <Button variant="primary" size="sm" onClick={() => setFinishing(true)}>
              <Flag /> Finish
            </Button>
          ) : (
            <span className="rounded-[4px] bg-wash px-1.5 text-xs leading-[20px] text-fg-2">{p.run.status === "completed" ? "Completed" : p.run.status === "abandoned" ? "Abandoned" : "In progress"}</span>
          )}
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-wash" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label="Progress">
            <div className="h-full rounded-full bg-good transition-[width]" style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
          </div>
          <span className="font-mono text-xs text-muted">
            {done}/{total}
          </span>
        </div>
      </div>

      <p className="mb-6 text-xs text-muted">
        Started by {p.run.startedByName}, <LocalDate iso={p.run.startedAt} withTime />
        {p.run.completedAt && (
          <>
            {" "}· finished <LocalDate iso={p.run.completedAt} withTime />
          </>
        )}
      </p>

      <SopBody
        blocks={p.blocks}
        roles={p.roles}
        snippets={p.snippets}
        slots={{
          badge: (step, num) => box(step.id, num),
          check: (item) => <span className="mt-[1px]">{box(item.id, "")}</span>,
          actions: (step) =>
            live ? (
              <button type="button" onClick={() => setNoteFor(step.id)} className="grid size-6 place-items-center rounded-[4px] text-faint hover:bg-wash hover:text-fg-hi" aria-label="Add a note to this step">
                <MessageSquareText className="size-3.5" />
              </button>
            ) : null,
          footer: (step) => {
            const s = state[step.id];
            if (!s?.note && !s?.completedAt && !s?.skipped) return null;
            return (
              <div className="text-xs text-muted">
                {s.completedAt && (
                  <span className="inline-flex items-center gap-1 text-good">
                    <CheckCircle2 className="size-3" /> {s.completedByName ?? "Done"} · <LocalDate iso={s.completedAt} withTime />
                  </span>
                )}
                {s.skipped && !s.completedAt && <span className="text-warn">Skipped</span>}
                {s.note && <p className="mt-1 whitespace-pre-line rounded-[6px] border border-line px-2.5 py-1.5 text-[13px] text-fg-2">{s.note}</p>}
              </div>
            );
          },
        }}
      />

      <NoteDialog
        open={noteFor !== null}
        initial={noteFor ? (state[noteFor]?.note ?? "") : ""}
        onOpenChange={(o) => !o && setNoteFor(null)}
        onSave={(note) =>
          start(async () => {
            const id = noteFor!;
            const res = await noteStepAction(p.run.id, id, note);
            if (!res.ok) return void toast.error(res.error);
            setState((s) => ({ ...s, [id]: { ...(s[id] ?? { blockId: id, completedAt: null, completedByName: null, skipped: false }), note } }));
            setNoteFor(null);
          })
        }
      />

      <Dialog open={finishing} onOpenChange={setFinishing}>
        <DialogContent title="Finish this run?" description={done < total ? `${total - done} step${total - done === 1 ? " is" : "s are"} not ticked. They'll be recorded as skipped.` : "Every step is ticked."}>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await finishRunAction(p.run.id, "abandoned");
                  if (!res.ok) toast.error(res.error);
                  setFinishing(false);
                })
              }
            >
              Abandon run
            </Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await finishRunAction(p.run.id, "completed");
                  if (!res.ok) return void toast.error(res.error);
                  toast("Run completed");
                  setFinishing(false);
                })
              }
            >
              <Flag /> Finish run
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoteDialog({ open, initial, onOpenChange, onSave }: { open: boolean; initial: string; onOpenChange: (o: boolean) => void; onSave: (note: string) => void }) {
  const [text, setText] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setText(initial);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Note on this step" description="Saved with the run, e.g. a reading, a fault, or what you did differently.">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(text);
          }}
        >
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} autoFocus className="w-full rounded-[6px] border border-line bg-transparent px-3 py-2 text-[14px] outline-none focus:border-line-2" aria-label="Note" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save note
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
