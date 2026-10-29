"use client";

import { ArrowUp, Camera, Link2, Paperclip, Pencil, Trash2, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { commentOnTaskAction, createTaskAction, deleteTaskAction, deleteWorkCommentAction, updateTaskAction } from "@/app/actions/projects";
import { Ago } from "@/components/local-date";
import { Markdown } from "@/components/markdown";
import { MentionBox, MentionText } from "@/components/mention-box";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/field";
import { formatDay } from "@/lib/format";
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, isOverdue, type Priority, type TaskStatus } from "@/lib/work";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/db/schema";
import type { ActivityItem } from "@/server/services/activity";
import type { TaskView, WorkComment } from "@/server/services/tasks";
import { Avatar } from "./badges";
import type { Member } from "./tasks-view";

export type OpenTask = {
  task: TaskView;
  subtasks: TaskView[];
  comments: WorkComment[];
  history: ActivityItem[];
  project: { id: string; name: string } | null;
  parent: { id: string; title: string } | null;
};

/** Uploads a file for project work and returns it as an attachment. */
export async function uploadAttachment(file: File): Promise<Attachment> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("kind", "attachment");
  const res = await fetch("/api/files", { method: "POST", body: fd });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Upload failed");
  return { url: body.url, name: body.name, size: body.size, mime: body.mime };
}

export function AttachmentList({ items, onRemove }: { items: Attachment[]; onRemove?: (i: number) => void }) {
  if (!items.length) return <p className="text-[13px] text-muted">No files yet.</p>;
  return (
    <ul className="grid gap-1" role="list">
      {items.map((a, i) => (
        <li key={`${a.url}-${i}`} className="flex items-center gap-2 rounded-[6px] border border-line px-2 py-1.5 text-[13px]">
          {a.mime?.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded file
            <img src={a.url} alt="" className="size-8 shrink-0 rounded-[4px] object-cover" />
          ) : a.external ? (
            <Link2 className="size-4 shrink-0 text-muted" />
          ) : (
            <Paperclip className="size-4 shrink-0 text-muted" />
          )}
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-fg-hi hover:underline">
            {a.name}
          </a>
          {a.size ? <span className="shrink-0 text-xs text-muted">{a.size > 1048576 ? `${(a.size / 1048576).toFixed(1)} MB` : `${Math.ceil(a.size / 1024)} KB`}</span> : null}
          {onRemove && (
            <Button size="icon-sm" variant="ghost" className="size-6" aria-label={`Remove ${a.name}`} onClick={() => onRemove(i)}>
              <X />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function TaskDrawer({ open, members, selfId, today, onClose, onOpen }: { open: OpenTask | null; members: Member[]; selfId: string; today: string; onClose: () => void; onOpen: (id: string) => void }) {
  return (
    <Dialog open={open !== null} onOpenChange={(o) => !o && onClose()} modal={false}>
      {open && <Drawer data={open} members={members} selfId={selfId} today={today} onClose={onClose} onOpen={onOpen} />}
    </Dialog>
  );
}

function Drawer({ data, members, selfId, today, onClose, onOpen }: { data: OpenTask; members: Member[]; selfId: string; today: string; onClose: () => void; onOpen: (id: string) => void }) {
  const t = data.task;
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(t.title);
  const [labels, setLabels] = useState(t.labels.join(", "));
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(t.description);
  const [sub, setSub] = useState("");
  const [comment, setComment] = useState("");
  const [tab, setTab] = useState<"comments" | "history">("comments");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const names = new Map(members.map((m) => [m.id, m.name]));

  const save = (patch: Parameters<typeof updateTaskAction>[1], id = t.id) =>
    start(async () => {
      const res = await updateTaskAction(id, patch);
      if (!res.ok) toast.error(res.error);
    });
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: Attachment[] = [];
      for (const f of Array.from(files)) added.push(await uploadAttachment(f));
      save({ attachments: [...t.attachments, ...added] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <SheetContent
      title={
        data.parent ? (
          <button type="button" className="flex items-center gap-1 text-left text-muted hover:text-fg-hi" onClick={() => onOpen(data.parent!.id)}>
            <ArrowUp className="size-3.5" /> {data.parent.title}
          </button>
        ) : (
          (data.project?.name ?? "General tasks")
        )
      }
      description="Task details"
      className="sm:w-[480px]"
      actions={
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Delete task"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete “${t.title}”${data.subtasks.length ? ` and its ${data.subtasks.length} subtask${data.subtasks.length === 1 ? "" : "s"}` : ""}?`)) return;
            start(async () => {
              const res = await deleteTaskAction(t.id);
              if (res.ok) onClose();
              else toast.error(res.error);
            });
          }}
        >
          <Trash2 />
        </Button>
      }
    >
      <div className="grid gap-5 px-4 py-4">
        <Textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== t.title && save({ title })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          rows={1}
          aria-label="Task title"
          className="min-h-0 resize-none border-transparent bg-transparent px-1 text-[17px] font-[510] text-fg-hi hover:border-hair"
        />

        <dl className="grid grid-cols-[88px_1fr] items-center gap-x-3 gap-y-2 text-[13px]">
          <dt className="text-muted">Status</dt>
          <dd>
            <Select value={t.status} onChange={(e) => save({ status: e.target.value as TaskStatus })} aria-label="Status" className="h-8">
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </dd>
          <dt className="text-muted">Priority</dt>
          <dd>
            <Select value={t.priority} onChange={(e) => save({ priority: e.target.value as Priority })} aria-label="Priority" className="h-8">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </dd>
          <dt className="text-muted">Start</dt>
          <dd>
            <Input type="date" defaultValue={t.start ?? ""} onChange={(e) => save({ start: e.target.value || null })} aria-label="Start date" className="h-8" />
          </dd>
          <dt className="text-muted">Due</dt>
          <dd>
            <Input type="date" defaultValue={t.due ?? ""} onChange={(e) => save({ due: e.target.value || null })} aria-label="Due date" className={cn("h-8", isOverdue(t, today) && "border-bad/60 text-bad")} />
          </dd>
          <dt className="self-start pt-1 text-muted">Assignees</dt>
          <dd className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const on = t.assignees.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => save({ assignees: on ? t.assignees.filter((u) => u !== m.id) : [...t.assignees, m.id] })}
                  className={cn("flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs", on ? "border-fg-2 bg-wash text-fg-hi" : "border-line text-muted hover:text-fg-hi")}
                >
                  <Avatar name={m.name} size="xs" /> {m.name}
                </button>
              );
            })}
          </dd>
          <dt className="text-muted">Labels</dt>
          <dd>
            <Input
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              onBlur={() => {
                const next = labels.split(",").map((l) => l.trim()).filter(Boolean);
                if (next.join(",") !== t.labels.join(",")) save({ labels: next });
              }}
              placeholder="Audio, Cabling…"
              aria-label="Labels"
              className="h-8"
            />
          </dd>
        </dl>

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-xs font-[510] text-muted">Description</h3>
            {!editingDesc && (
              <Button size="xs" variant="ghost" onClick={() => setEditingDesc(true)}>
                <Pencil /> Edit
              </Button>
            )}
          </div>
          {editingDesc ? (
            <div className="grid gap-2">
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={7} autoFocus aria-label="Description" className="font-mono text-[13px]" />
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => (setDesc(t.description), setEditingDesc(false))}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={() => (save({ description: desc }), setEditingDesc(false))}>
                  Save
                </Button>
              </div>
              <p className="text-xs text-faint">Markdown: **bold**, - lists, [links](https://…)</p>
            </div>
          ) : t.description ? (
            <Markdown source={t.description} />
          ) : (
            <p className="text-[13px] text-muted">No description.</p>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 text-xs font-[510] text-muted">
            Subtasks {data.subtasks.length > 0 && `${data.subtasks.filter((s) => s.status === "done").length}/${data.subtasks.length}`}
          </h3>
          <ul className="grid gap-0.5" role="list">
            {data.subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-[6px] px-1 py-1 hover:bg-wash-2">
                <input type="checkbox" checked={s.status === "done"} onChange={() => save({ status: s.status === "done" ? "todo" : "done" }, s.id)} aria-label={`Done: ${s.title}`} className="size-4 accent-[var(--color-good)]" />
                <button type="button" onClick={() => onOpen(s.id)} className={cn("min-w-0 flex-1 truncate text-left text-[13px] text-fg-hi", s.status === "done" && "text-muted line-through")}>
                  {s.title}
                </button>
                <span className="flex -space-x-1">
                  {s.assignees.filter((u) => names.has(u)).map((u) => (
                    <Avatar key={u} name={names.get(u)!} size="xs" />
                  ))}
                </span>
                {s.due && <span className="font-mono text-[11px] text-muted">{formatDay(s.due, { month: "short", day: "numeric" })}</span>}
              </li>
            ))}
          </ul>
          <form
            className="mt-1.5 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!sub.trim()) return;
              start(async () => {
                const res = await createTaskAction({ projectId: t.projectId, parentId: t.id, title: sub });
                if (res.ok) setSub("");
                else toast.error(res.error);
              });
            }}
          >
            <Input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Add a subtask…" aria-label="New subtask" className="h-8" />
            <Button type="submit" size="sm" disabled={!sub.trim() || pending}>
              Add
            </Button>
          </form>
        </section>

        <section>
          <div className="mb-1.5 flex flex-wrap items-center gap-1">
            <h3 className="flex-1 text-xs font-[510] text-muted">Files</h3>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
            <Button size="xs" variant="ghost" disabled={uploading} onClick={() => cameraRef.current?.click()}>
              <Camera /> Photo
            </Button>
            <Button size="xs" variant="ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Paperclip /> {uploading ? "Uploading…" : "Upload"}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                const url = prompt("Link address (https://…)")?.trim();
                if (!url) return;
                const name = prompt("Name for the link", url.replace(/^https?:\/\//, "").slice(0, 80))?.trim() || url;
                save({ attachments: [...t.attachments, { url, name, external: true }] });
              }}
            >
              <Link2 /> Link
            </Button>
          </div>
          <AttachmentList items={t.attachments} onRemove={(i) => save({ attachments: t.attachments.filter((_, j) => j !== i) })} />
        </section>

        <section>
          <div className="mb-2 flex gap-1 border-b border-line" role="tablist">
            {(
              [
                ["comments", `Comments (${data.comments.length})`],
                ["history", "History"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("relative px-2 py-1.5 text-[13px] text-muted", tab === k && "text-fg-hi after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:bg-cta")}>
                {l}
              </button>
            ))}
          </div>
          {tab === "comments" ? (
            <div className="grid gap-3">
              {data.comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <Avatar name={c.authorName ?? "?"} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 text-xs">
                      <b className="font-[510] text-fg-hi">{c.authorName ?? "Someone"}</b>
                      <Ago iso={c.createdAt} className="text-faint" />
                      {c.authorId === selfId && (
                        <button
                          type="button"
                          className="ml-auto text-faint hover:text-bad"
                          onClick={() =>
                            start(async () => {
                              const res = await deleteWorkCommentAction(c.id);
                              if (!res.ok) toast.error(res.error);
                            })
                          }
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <MentionText text={c.body} />
                  </div>
                </div>
              ))}
              {!data.comments.length && <p className="text-[13px] text-muted">No comments yet. Type @ to mention someone.</p>}
              <MentionBox
                members={members}
                value={comment}
                onChange={setComment}
                placeholder="Write a comment… type @ to mention"
                rows={2}
                onSubmit={() => postComment()}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-faint">Mentions notify that person.</span>
                <Button size="sm" variant="primary" disabled={!comment.trim() || pending} onClick={() => postComment()}>
                  Comment
                </Button>
              </div>
            </div>
          ) : (
            <ul className="grid gap-2" role="list">
              {data.history.map((a) => (
                <li key={a.id} className="text-[13px] text-fg-2">
                  <b className="font-[510] text-fg-hi">{a.actorName ?? "Someone"}</b> {a.text} <Ago iso={a.createdAt} className="text-xs text-faint" />
                </li>
              ))}
              <li className="text-xs text-muted">
                Created <Ago iso={t.createdAt} />
                {t.createdByName && ` by ${t.createdByName}`}
              </li>
            </ul>
          )}
        </section>
      </div>
    </SheetContent>
  );

  function postComment() {
    if (!comment.trim()) return;
    start(async () => {
      const res = await commentOnTaskAction(t.id, comment);
      if (res.ok) setComment("");
      else toast.error(res.error);
    });
  }
}
