"use client";

import { Check, Flag, MessageSquare, MessageSquarePlus, PencilLine, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { acceptSuggestionAction, addCommentAction, deleteCommentAction, rejectSuggestionAction, setResolvedAction, submitFeedbackAction } from "@/app/actions/discussion";
import type { Thread } from "@/server/services/comments";
import { LocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export type StepInfo = { label: string; texts: { title: string; description: string; expectedResult: string; warning: string } | null };
type Field = "title" | "description" | "expectedResult" | "warning";
const FIELD_LABEL: Record<Field, string> = { title: "Step title", description: "Details", expectedResult: "Expected result", warning: "Warning" };
type Mode = "comments" | "suggest" | "feedback";

type Ctx = {
  sopId: string;
  threads: Thread[];
  feedbackCounts: Record<string, number>;
  steps: Record<string, StepInfo>;
  members: { username: string; name: string }[];
  userId: string | null;
  canEdit: boolean;
  allowFeedback: boolean;
  open: (blockKey: string | null, mode?: Mode) => void;
};
const DiscussionContext = createContext<Ctx | null>(null);

/** Wraps the reading view: owns the side panel and gives each step its comment and feedback buttons. */
export function DiscussionProvider({ children, ...value }: Omit<Ctx, "open"> & { children: ReactNode }) {
  const [panel, setPanel] = useState<{ blockKey: string | null; mode: Mode } | null>(null);
  const sp = useSearchParams();
  const linked = sp.get("comments");
  // Notification links point at a thread: open the panel on its step whenever the link changes.
  const [seenLink, setSeenLink] = useState<string | null>(null);
  if (linked !== seenLink) {
    setSeenLink(linked);
    const t = linked ? value.threads.find((x) => x.id === linked) : undefined;
    if (t) setPanel({ blockKey: t.blockKey, mode: "comments" });
  }
  const ctx: Ctx = { ...value, open: (blockKey, mode = "comments") => setPanel({ blockKey, mode }) };
  return (
    <DiscussionContext.Provider value={ctx}>
      {children}
      <Dialog open={panel !== null} onOpenChange={(o) => !o && setPanel(null)} modal={false}>
        {panel && <Panel key={`${panel.blockKey}:${panel.mode}`} blockKey={panel.blockKey} initialMode={panel.mode} highlight={linked} />}
      </Dialog>
    </DiscussionContext.Provider>
  );
}

function useDiscussion() {
  const c = useContext(DiscussionContext);
  if (!c) throw new Error("useDiscussion outside DiscussionProvider");
  return c;
}

/** The small buttons at the end of each step's title row. */
export function StepTools({ blockKey }: { blockKey: string }) {
  const d = useDiscussion();
  const open = d.threads.filter((t) => t.blockKey === blockKey && !t.resolvedAt).length;
  const flags = d.feedbackCounts[blockKey] ?? 0;
  if (!d.userId) return null;
  return (
    <span className="sop-step-tools -mr-1 flex shrink-0 items-center gap-0.5 print:hidden">
      {d.canEdit && flags > 0 && (
        <a href={`/sops/${d.sopId}/feedback`} className="inline-flex h-6 items-center gap-1 rounded-[4px] bg-warn-soft px-1.5 text-xs text-warn" title={`${flags} open feedback`}>
          <Flag className="size-3" aria-hidden /> {flags}
        </a>
      )}
      <button
        type="button"
        onClick={() => d.open(blockKey)}
        className={cn("inline-flex h-6 items-center gap-1 rounded-[4px] px-1.5 text-xs hover:bg-wash hover:text-fg-hi", open ? "text-fg-2" : "text-faint opacity-0 group-hover/step:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100")}
        aria-label={open ? `${open} comment${open === 1 ? "" : "s"} on this step` : "Comment on this step"}
      >
        <MessageSquare className="size-3.5" aria-hidden />
        {open > 0 && open}
      </button>
      {d.allowFeedback && (
        <button
          type="button"
          onClick={() => d.open(blockKey, "feedback")}
          className="inline-flex h-6 items-center rounded-[4px] px-1.5 text-faint opacity-0 hover:bg-wash hover:text-fg-hi focus:opacity-100 group-hover/step:opacity-100 [@media(hover:none)]:opacity-100"
          aria-label="Report a problem with this step"
          title="This step is unclear or wrong"
        >
          <Flag className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}

/** Header button: every thread on the SOP. */
export function CommentsButton() {
  const d = useDiscussion();
  const open = d.threads.filter((t) => !t.resolvedAt).length;
  if (!d.userId) return null;
  return (
    <Button size="sm" variant="ghost" onClick={() => d.open(null)} aria-label="Comments">
      <MessageSquare /> <span className="hidden sm:inline">Comments</span>
      {open > 0 && <span className="font-mono text-xs text-muted">{open}</span>}
    </Button>
  );
}

function Panel({ blockKey, initialMode, highlight }: { blockKey: string | null; initialMode: Mode; highlight: string | null }) {
  const d = useDiscussion();
  const step = blockKey ? d.steps[blockKey] : undefined;
  const canSuggest = Boolean(blockKey && step?.texts && !blockKey.includes("~"));
  const [mode, setMode] = useState<Mode>(initialMode);
  const [showResolved, setShowResolved] = useState(false);
  const threads = d.threads.filter((t) => blockKey === null || t.blockKey === blockKey);
  const visible = threads.filter((t) => showResolved || !t.resolvedAt || t.id === highlight);
  const resolvedCount = threads.filter((t) => t.resolvedAt).length;
  const tabs: [Mode, string][] = [["comments", "Comments"], ...(canSuggest ? ([["suggest", "Suggest edit"]] as [Mode, string][]) : []), ...(d.allowFeedback && blockKey ? ([["feedback", "Report problem"]] as [Mode, string][]) : [])];

  return (
    <SheetContent title={blockKey ? (step?.label ?? "Removed step") : "Comments"} description={blockKey ? "Comments stay with this step across versions." : "All threads on this SOP"}>
      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-line px-3 py-2" role="tablist">
          {tabs.map(([m, label]) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("rounded-[6px] px-2.5 py-1 text-[13px]", mode === m ? "bg-wash text-fg-hi" : "text-muted hover:text-fg-hi")}>
              {label}
            </button>
          ))}
        </div>
      )}
      {mode === "comments" && (
        <div className="grid gap-3 p-4">
          {visible.length === 0 && <p className="text-[13px] text-muted">{resolvedCount ? "No open threads." : "No comments yet. Ask a question or point out something to fix."}</p>}
          {visible.map((t) => (
            <ThreadView key={t.id} thread={t} showStep={blockKey === null} highlighted={t.id === highlight} />
          ))}
          {resolvedCount > 0 && (
            <button className="justify-self-start text-xs text-muted underline underline-offset-2 hover:text-fg-hi" onClick={() => setShowResolved((s) => !s)}>
              {showResolved ? "Hide resolved" : `Show ${resolvedCount} resolved`}
            </button>
          )}
          <Composer blockKey={blockKey} placeholder={blockKey ? "Comment on this step…  @name to mention" : "Comment on the whole SOP…  @name to mention"} />
        </div>
      )}
      {mode === "suggest" && step?.texts && blockKey && <SuggestForm blockKey={blockKey} texts={step.texts} onDone={() => setMode("comments")} />}
      {mode === "feedback" && blockKey && <FeedbackForm blockKey={blockKey} />}
    </SheetContent>
  );
}

/** Renders @mentions in bold. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(@[a-z0-9._-]{2,40})/gi);
  return (
    <p className="whitespace-pre-line break-words text-[13.5px] text-fg-2">
      {parts.map((p, i) => (p.startsWith("@") ? <b key={i} className="font-[510] text-fg-hi">{p}</b> : p))}
    </p>
  );
}

function ThreadView({ thread: t, showStep, highlighted }: { thread: Thread; showStep: boolean; highlighted: boolean }) {
  const d = useDiscussion();
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: "center" });
  }, [highlighted]);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Something went wrong");
      else if (msg) toast(msg);
    });
  const canResolve = t.authorId === d.userId || d.canEdit;
  return (
    <div ref={ref} className={cn("rounded-[8px] border border-line bg-surface px-3 py-2.5", t.resolvedAt && "opacity-70", highlighted && "border-fg-2")}>
      {showStep && t.blockKey && (
        <button className="mb-1 block max-w-full truncate text-left text-xs text-muted hover:text-fg-hi" onClick={() => d.open(t.blockKey)}>
          {d.steps[t.blockKey]?.label ?? "Removed step"}
        </button>
      )}
      <CommentLine c={t} onDelete={t.authorId === d.userId ? () => act(() => deleteCommentAction(t.id)) : undefined} />
      {t.suggestion && (
        <div className="mt-2 rounded-[6px] border border-line text-[13px]">
          <div className="border-b border-line px-2.5 py-1 text-xs text-muted">Suggested {FIELD_LABEL[t.suggestion.field as Field]?.toLowerCase() ?? "text"}</div>
          <div className="grid gap-1 px-2.5 py-2">
            <del className="whitespace-pre-line text-bad decoration-bad/60">{t.suggestion.before || "(empty)"}</del>
            <ins className="whitespace-pre-line text-good no-underline">{t.suggestion.after || "(empty)"}</ins>
          </div>
          {t.suggestionStatus === "pending" && d.canEdit && (
            <div className="flex justify-end gap-1.5 border-t border-line px-2 py-1.5">
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => rejectSuggestionAction(t.id), "Suggestion rejected")}>
                <X /> Reject
              </Button>
              <Button size="sm" variant="primary" disabled={pending} onClick={() => act(() => acceptSuggestionAction(t.id), "Added to the draft")}>
                <Check /> Accept into draft
              </Button>
            </div>
          )}
          {t.suggestionStatus && t.suggestionStatus !== "pending" && <div className="border-t border-line px-2.5 py-1 text-xs text-muted">{t.suggestionStatus === "accepted" ? "Accepted into the draft" : "Not used"}</div>}
        </div>
      )}
      {t.replies.map((r) => (
        <div key={r.id} className="mt-2.5 border-l border-line pl-3">
          <CommentLine c={r} onDelete={r.authorId === d.userId ? () => act(() => deleteCommentAction(r.id)) : undefined} />
        </div>
      ))}
      <div className="mt-2 flex items-center gap-1">
        {!t.resolvedAt && <Composer parentId={t.id} blockKey={t.blockKey} placeholder="Reply…" compact />}
        {canResolve && (
          <Button size="sm" variant="ghost" className="ml-auto shrink-0" disabled={pending} onClick={() => act(() => setResolvedAction(t.id, !t.resolvedAt))}>
            {t.resolvedAt ? (
              <>
                <RotateCcw /> Reopen
              </>
            ) : (
              <>
                <Check /> Resolve
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function CommentLine({ c, onDelete }: { c: { authorName: string; body: string; createdAt: string }; onDelete?: () => void }) {
  return (
    <div className="group/c">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-[510] text-fg-hi">{c.authorName}</span>
        <span className="text-faint">
          <LocalDate iso={c.createdAt} withTime />
        </span>
        {onDelete && (
          <button onClick={onDelete} className="ml-auto text-faint opacity-0 hover:text-bad group-hover/c:opacity-100" aria-label="Delete comment">
            <Trash2 className="size-3" />
          </button>
        )}
      </div>
      <Body text={c.body} />
    </div>
  );
}

/** Comment box with @mention autocomplete from the workspace's members. */
function Composer({ blockKey, parentId, placeholder, compact }: { blockKey: string | null; parentId?: string; placeholder: string; compact?: boolean }) {
  const d = useDiscussion();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(!compact);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const query = text.match(/(?:^|\s)@([a-z0-9._-]*)$/i)?.[1]?.toLowerCase();
  const matches = query !== undefined ? d.members.filter((m) => m.username.toLowerCase().startsWith(query) || m.name.toLowerCase().includes(query)).slice(0, 5) : [];
  const submit = () =>
    start(async () => {
      const res = await addCommentAction(d.sopId, { body: text, blockKey, parentId: parentId ?? null });
      if (!res.ok) return void toast.error(res.error);
      setText("");
      if (compact) setFocused(false);
    });
  if (compact && !focused)
    return (
      <button className="flex-1 rounded-[6px] px-2 py-1 text-left text-[13px] text-faint hover:bg-wash-2" onClick={() => setFocused(true)}>
        Reply…
      </button>
    );
  return (
    <div className="relative flex-1">
      <Textarea
        ref={ref}
        value={text}
        autoFocus={compact}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) {
            e.preventDefault();
            submit();
          }
        }}
        rows={compact ? 2 : 3}
        maxLength={5000}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {matches.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-[6px] border border-line bg-surface-3 shadow-lg" role="listbox">
          {matches.map((m) => (
            <li key={m.username}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-wash"
                onClick={() => {
                  setText(text.replace(/@([a-z0-9._-]*)$/i, `@${m.username} `));
                  ref.current?.focus();
                }}
              >
                <span className="text-fg-hi">{m.name}</span>
                <span className="font-mono text-xs text-muted">@{m.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 flex justify-end gap-1.5">
        {compact && (
          <Button size="sm" variant="ghost" onClick={() => (setText(""), setFocused(false))}>
            Cancel
          </Button>
        )}
        <Button size="sm" variant="primary" disabled={pending || !text.trim()} onClick={submit}>
          <MessageSquarePlus /> {parentId ? "Reply" : "Comment"}
        </Button>
      </div>
    </div>
  );
}

function SuggestForm({ blockKey, texts, onDone }: { blockKey: string; texts: NonNullable<StepInfo["texts"]>; onDone: () => void }) {
  const d = useDiscussion();
  const [field, setField] = useState<Field>("title");
  const [after, setAfter] = useState(texts.title);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addCommentAction(d.sopId, { body: note.trim() || "Suggested edit", blockKey, suggestion: { field, after } });
          if (!res.ok) return void toast.error(res.error);
          toast("Suggestion sent to the owner");
          onDone();
        });
      }}
    >
      <p className="text-[13px] text-muted">The owner or an editor can accept your wording into the next version.</p>
      <Select
        value={field}
        onChange={(e) => {
          const f = e.target.value as Field;
          setField(f);
          setAfter(texts[f]);
        }}
        aria-label="What to change"
      >
        {(Object.keys(FIELD_LABEL) as Field[]).map((f) => (
          <option key={f} value={f}>
            {FIELD_LABEL[f]}
          </option>
        ))}
      </Select>
      <Textarea value={after} onChange={(e) => setAfter(e.target.value)} rows={4} maxLength={10000} aria-label="Suggested text" />
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Why? (optional)" aria-label="Reason" />
      <Button type="submit" variant="primary" disabled={pending || after === texts[field]} className="justify-self-end">
        <PencilLine /> Suggest edit
      </Button>
    </form>
  );
}

function FeedbackForm({ blockKey }: { blockKey: string }) {
  const d = useDiscussion();
  const router = useRouter();
  const [type, setType] = useState<"unclear" | "wrong" | "other">("unclear");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  if (sent)
    return (
      <div className="grid gap-2 p-4 text-[13.5px]">
        <p className="text-fg-hi">Thanks. The owner has been told.</p>
        <p className="text-muted">You'll get a notification when they respond.</p>
        <Button size="sm" className="justify-self-start" onClick={() => router.refresh()}>
          Done
        </Button>
      </div>
    );
  return (
    <form
      className="grid gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await submitFeedbackAction(d.sopId, { blockKey, type, message });
          if (!res.ok) return void toast.error(res.error);
          setSent(true);
        });
      }}
    >
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-[13px] text-muted">What's the problem with this step?</legend>
        {(
          [
            ["unclear", "This step is unclear"],
            ["wrong", "This step is wrong"],
            ["other", "Something else"],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[14px] hover:bg-wash-2">
            <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v)} />
            {label}
          </label>
        ))}
      </fieldset>
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} placeholder={type === "wrong" ? "What actually happens?" : "What would help?"} aria-label="Details" required={type === "other"} />
      <Button type="submit" variant="primary" disabled={pending} className="justify-self-end">
        <Flag /> Send to owner
      </Button>
    </form>
  );
}
