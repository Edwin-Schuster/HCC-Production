"use client";

import "@blocknote/mantine/style.css";
import "./editor.css";
import { BlockNoteView } from "@blocknote/mantine";
import { DragHandleMenu, RemoveBlockItem, SideMenu, SideMenuController, SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { ArrowLeft, Eye, MoreHorizontal, Pencil, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { discardDraftAction, publishAction } from "@/app/actions/sops";
import { SopBody } from "@/blocks/render";
import { DocumentSchema, type BlockNode } from "@/blocks/schema";
import { EDITOR_COMMAND, type EditorCommand } from "@/components/shell/palette-bus";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Kbd, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useTheme } from "@/components/theme";
import { cn } from "@/lib/utils";
import { expandSnippets } from "@/blocks/snippets";
import { numberSteps, plain, walk } from "@/blocks/tree";
import { fromBlockNote, imageExtras, keyMap, toBlockNote, type BNBlock } from "./convert";
import { CollapseItem, DuplicateItem, getSlashItems } from "./menu-items";
import { sopSchema, type SopEditor as Editor } from "./schema";
import { catalogResolver, storeFor, type SnippetCatalogItem } from "./store";

export type EditorProps = {
  sopId: string;
  documentCode: string;
  folderName: string;
  published: boolean;
  initial: {
    draftExists: boolean;
    draftUpdatedAt: string | null;
    baseVersionId: string | null;
    baseVersionNumber: number | null;
    title: string;
    summary: string;
    blocks: BlockNode[];
  };
  roles: { id: string; name: string }[];
  snippets: SnippetCatalogItem[];
};

type SaveState = "clean" | "dirty" | "saving" | "saved" | "offline" | "error" | "conflict";
type LocalDraft = { title: string; summary: string; blocks: BlockNode[]; at: number; serverUpdatedAt: string | null };

const AUTOSAVE_MS = 1200;
const localKey = (id: string) => `hcc-sop-draft:${id}`;

function readLocal(id: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(localKey(id));
    return raw ? (JSON.parse(raw) as LocalDraft) : null;
  } catch {
    return null;
  }
}
function writeLocal(id: string, d: LocalDraft) {
  try {
    localStorage.setItem(localKey(id), JSON.stringify(d));
  } catch {
    /* storage full or blocked: the server copy still saves */
  }
}
function clearLocal(id: string) {
  try {
    localStorage.removeItem(localKey(id));
  } catch {}
}

export default function SopEditor({ sopId, documentCode, folderName, published, initial, roles, snippets }: EditorProps) {
  const router = useRouter();
  const keys = useMemo(() => keyMap(initial.blocks), [initial.blocks]);
  const images = useMemo(() => imageExtras(initial.blocks), [initial.blocks]);
  const resolveSnippet = useMemo(() => catalogResolver(snippets), [snippets]);
  const uploadFile = useCallback(async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/files", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error(j.error ?? "Upload failed");
      throw new Error(j.error ?? "Upload failed");
    }
    return j.url as string;
  }, []);

  const editor = useCreateBlockNote(
    {
      schema: sopSchema,
      initialContent: initial.blocks.length ? (toBlockNote(initial.blocks) as never) : undefined,
      uploadFile,
      tables: { headers: true },
      animations: false,
    },
    [],
  ) as unknown as Editor;

  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [state, setState] = useState<SaveState>("clean");
  const [message, setMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(initial.draftUpdatedAt);
  const [preview, setPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // The editor only renders in the browser (ssr: false), so local storage is readable on the first render.
  const [recovered, setRecovered] = useState<LocalDraft | null>(() => {
    const local = readLocal(sopId);
    if (!local) return null;
    const serverTime = initial.draftUpdatedAt ? Date.parse(initial.draftUpdatedAt) : 0;
    const differs = JSON.stringify(local.blocks) !== JSON.stringify(initial.blocks) || local.title !== initial.title || local.summary !== initial.summary;
    return local.at > serverTime && differs ? local : null;
  });
  const theme = useTheme() ?? "dark";

  // Server sync bookkeeping kept in refs so autosave never works from stale closures.
  const base = useRef({ updatedAt: initial.draftUpdatedAt, versionId: initial.baseVersionId });
  const latest = useRef({ title, summary });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const dirty = useRef(false);


  const snapshot = useCallback((): BlockNode[] => fromBlockNote(editor.document as unknown as BNBlock[], keys, images), [editor, keys, images]);

  /** Numbers and branch targets come from the same expanded tree the reading view uses. */
  const renumber = useCallback(() => {
    const { blocks } = expandSnippets(snapshot(), resolveSnippet);
    const numbers = numberSteps(blocks);
    const steps = [];
    for (const { node } of walk(blocks)) if (node.type === "step" && !node.id.includes("~")) steps.push({ key: node.key, number: numbers.get(node.id) ?? "", title: plain(node.content.title) });
    storeFor(editor).set({ numbers, steps });
  }, [editor, snapshot, resolveSnippet]);

  /** Saves now. Returns true when the server has the latest content. */
  const save = useCallback(
    async (opts: { force?: boolean } = {}): Promise<boolean> => {
      if (inFlight.current) await inFlight.current;
      if (!dirty.current && !opts.force) return true;
      clearTimeout(timer.current);
      const blocks = snapshot();
      const parsed = DocumentSchema.safeParse(blocks);
      if (!parsed.success) {
        setState("error");
        setMessage(parsed.error.issues[0]?.message ?? "Some content isn't valid.");
        return false;
      }
      const body = {
        title: latest.current.title.trim() || "Untitled SOP",
        summary: latest.current.summary,
        blocks,
        baseUpdatedAt: base.current.updatedAt,
        baseVersionId: base.current.versionId,
        force: opts.force || undefined,
      };
      dirty.current = false;
      setState("saving");
      const run = (async () => {
        try {
          const r = await fetch(`/api/sops/${sopId}/draft`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const j = await r.json().catch(() => ({}));
          if (r.status === 409) {
            dirty.current = true;
            setState("conflict");
            setMessage(j.error ?? "Someone else changed this SOP.");
            return false;
          }
          if (!r.ok) {
            dirty.current = true;
            setState("error");
            setMessage(j.error ?? "Couldn't save.");
            return false;
          }
          base.current.updatedAt = j.updatedAt;
          setSavedAt(j.updatedAt);
          setMessage(null);
          if (!dirty.current) {
            setState("saved");
            clearLocal(sopId);
          }
          return true;
        } catch {
          dirty.current = true;
          setState("offline");
          setMessage("You're offline. Changes are kept on this device and will save when you're back.");
          return false;
        } finally {
          inFlight.current = null;
        }
      })();
      inFlight.current = run;
      return run;
    },
    [snapshot, sopId],
  );

  const changed = useCallback(() => {
    dirty.current = true;
    setState((s) => (s === "conflict" ? s : "dirty"));
    writeLocal(sopId, { title: latest.current.title, summary: latest.current.summary, blocks: snapshot(), at: Date.now(), serverUpdatedAt: base.current.updatedAt });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  }, [save, snapshot, sopId]);

  // Roles and numbering on mount; drop a local copy that the server already has.
  useEffect(() => {
    storeFor(editor).set({ roles, snippets, images, keyOf: (id) => keys.get(id) ?? id });
    renumber();
    if (!recovered) clearLocal(sopId);
    // Mount only: once the recovery banner is resolved, the local copy belongs to autosave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, roles, snippets, images, keys, renumber, sopId]);

  // Save when leaving: keepalive request plus the local copy as a fallback.
  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      const body = JSON.stringify({ title: latest.current.title.trim() || "Untitled SOP", summary: latest.current.summary, blocks: snapshot(), baseUpdatedAt: base.current.updatedAt, baseVersionId: base.current.versionId });
      if (body.length < 60_000) fetch(`/api/sops/${sopId}/draft`, { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        flush();
        e.preventDefault();
      }
    };
    const onOnline = () => dirty.current && void save();
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save({}).then((ok) => ok && toast("Saved"));
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
    window.addEventListener("keydown", onKey);
    return () => {
      flush();
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("keydown", onKey);
    };
  }, [save, snapshot, sopId]);

  // Commands from the ⌘K palette.
  useEffect(() => {
    const onCommand = (e: Event) => {
      const cmd = (e as CustomEvent<EditorCommand>).detail;
      if (cmd === "publish") return setPublishing(true);
      if (cmd === "preview") return setPreview((p) => !p);
      setPreview(false);
      const blockFor: Record<string, unknown> = {
        "insert-step": { type: "step" },
        "insert-substep": { type: "step" },
        "insert-heading": { type: "heading", props: { level: 2 } },
        "insert-checklist": { type: "checkListItem" },
        "insert-callout": { type: "callout", props: { variant: "info" } },
        "insert-code": { type: "codeBlock" },
        "insert-table": { type: "table", content: { type: "tableContent", rows: [{ cells: ["", "", ""] }, { cells: ["", "", ""] }] } },
        "insert-image": { type: "image" },
        "insert-divider": { type: "divider" },
      };
      const spec = blockFor[cmd];
      if (!spec) return;
      editor.focus();
      const at = editor.getTextCursorPosition().block;
      const [inserted] = editor.insertBlocks([spec as never], at, "after");
      editor.setTextCursorPosition(inserted, "end");
      if (cmd === "insert-substep" && editor.canNestBlock()) editor.nestBlock();
    };
    window.addEventListener(EDITOR_COMMAND, onCommand);
    return () => window.removeEventListener(EDITOR_COMMAND, onCommand);
  }, [editor]);

  const restoreLocal = () => {
    if (!recovered) return;
    editor.replaceBlocks(editor.document, toBlockNote(recovered.blocks) as never);
    setTitle(recovered.title);
    setSummary(recovered.summary);
    latest.current = { title: recovered.title, summary: recovered.summary };
    setRecovered(null);
    renumber();
    changed();
    toast("Unsaved changes restored");
  };

  const status = {
    clean: initial.draftExists ? "Draft" : published ? `Editing v${initial.baseVersionNumber}` : "New draft",
    dirty: "Unsaved changes",
    saving: "Saving…",
    saved: "Saved",
    offline: "Offline · saved on this device",
    error: "Not saved",
    conflict: "Conflict",
  }[state];

  return (
    <div className="min-h-dvh">
      <div className="sticky top-12 z-10 border-b border-line bg-bg/90 backdrop-blur lg:top-0">
        <div className="mx-auto flex h-12 max-w-[1000px] items-center gap-2 px-[max(12px,env(safe-area-inset-left))] sm:px-6">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/sops/${sopId}${published ? "?draft=1" : ""}`} onClick={() => void save()}>
              <ArrowLeft /> <span className="font-mono text-xs">{documentCode}</span>
            </Link>
          </Button>
          <span className="hidden truncate text-xs text-muted sm:inline">{folderName}</span>
          <span className="flex-1" />
          <span
            className={cn("flex items-center gap-1.5 text-xs", state === "error" || state === "conflict" ? "text-bad" : state === "offline" ? "text-warn" : "text-muted")}
            aria-live="polite"
            title={savedAt ? `Last saved ${new Date(savedAt).toLocaleString()}` : undefined}
          >
            <span className={cn("size-1.5 rounded-full", state === "saved" || state === "clean" ? "bg-good" : state === "saving" || state === "dirty" ? "bg-muted" : "bg-current")} />
            {status}
          </span>
          <Button size="sm" variant={preview ? "secondary" : "ghost"} onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? <Pencil /> : <Eye />} <span className="hidden sm:inline">{preview ? "Edit" : "Preview"}</span>
          </Button>
          {published && (
            <Menu>
              <MenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="More">
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem
                  danger
                  onSelect={async () => {
                    clearTimeout(timer.current);
                    dirty.current = false;
                    clearLocal(sopId);
                    const res = await discardDraftAction(sopId);
                    if (res && !res.ok) toast.error(res.error);
                  }}
                >
                  <Trash2 /> Discard draft
                </MenuItem>
              </MenuContent>
            </Menu>
          )}
          <Button size="sm" variant="primary" onClick={() => setPublishing(true)}>
            <Send /> Publish
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[860px] px-[max(16px,env(safe-area-inset-left))] pb-40 pt-8 sm:px-6">
        {recovered && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[6px] border border-iris/30 bg-info-soft px-3.5 py-2.5 text-[13px] text-fg-2" role="status">
            <span className="flex-1">Unsaved changes from {new Date(recovered.at).toLocaleString()} were found on this device.</span>
            <Button size="sm" variant="primary" onClick={restoreLocal}>
              Restore them
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearLocal(sopId);
                setRecovered(null);
              }}
            >
              Discard
            </Button>
          </div>
        )}
        {(state === "conflict" || state === "error") && message && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[6px] border border-bad/40 bg-bad-soft px-3.5 py-2.5 text-[13px] text-fg-2" role="alert">
            <span className="flex-1">{message}</span>
            {state === "conflict" && (
              <>
                <Button size="sm" onClick={() => router.refresh()}>
                  Reload their version
                </Button>
                <Button size="sm" variant="danger" onClick={() => void save({ force: true }).then((ok) => ok && toast("Your version was saved"))}>
                  Keep mine
                </Button>
              </>
            )}
            {state === "error" && (
              <Button size="sm" onClick={() => void save({ force: false })}>
                Try again
              </Button>
            )}
          </div>
        )}

        <div className="pl-0 sm:pl-[54px]">
          <TitleInput
            value={title}
            onChange={(v) => {
              setTitle(v);
              latest.current.title = v;
              changed();
            }}
          />
          <input
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              latest.current.summary = e.target.value;
              changed();
            }}
            placeholder="One-sentence summary"
            aria-label="Summary"
            maxLength={1000}
            className="mt-2 w-full bg-transparent text-[16px] text-muted outline-none placeholder:text-faint"
          />
          <p className="mt-4 hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint sm:flex">
            <span>
              <Kbd>/</Kbd> blocks
            </span>
            <span>
              <Kbd>Enter</Kbd> next step
            </span>
            <span>
              <Kbd>Tab</Kbd> / <Kbd>⇧Tab</Kbd> nest
            </span>
            <span>
              <Kbd>⌘K</Kbd> commands
            </span>
            <span>
              <Kbd>⌘S</Kbd> save now
            </span>
          </p>
        </div>

        <div className={cn("mt-6", preview && "hidden")}>
          <BlockNoteView
            editor={editor as never}
            theme={theme}
            slashMenu={false}
            sideMenu={false}
            onChange={() => {
              renumber();
              changed();
            }}
            className="hcc-editor"
          >
            <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems(editor)} />
            <SideMenuController
              sideMenu={(props) => (
                <SideMenu
                  {...props}
                  dragHandleMenu={() => (
                    <DragHandleMenu>
                      <DuplicateItem>Duplicate</DuplicateItem>
                      <CollapseItem />
                      <RemoveBlockItem>Delete</RemoveBlockItem>
                    </DragHandleMenu>
                  )}
                />
              )}
            />
          </BlockNoteView>
        </div>
        {preview && (
          <div className="mt-8 sm:pl-[54px]">
            <PreviewPane blocks={snapshot()} resolve={resolveSnippet} roles={roles} />
          </div>
        )}
      </div>

      <PublishDialog
        open={publishing}
        onOpenChange={setPublishing}
        nextVersion={(initial.baseVersionNumber ?? 0) + 1}
        onPublish={async (changeSummary) => {
          const ok = await save({ force: false });
          if (!ok && dirty.current) {
            toast.error("Save failed, so nothing was published. Fix the problem above and try again.");
            return false;
          }
          const res = await publishAction(sopId, changeSummary);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          clearLocal(sopId);
          toast(`Published v${res.data.versionNumber}`);
          router.push(`/sops/${sopId}`);
          return true;
        }}
      />
    </div>
  );
}

function TitleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (document.querySelector(".hcc-editor [contenteditable=true]") as HTMLElement | null)?.focus();
        }
      }}
      placeholder="Untitled SOP"
      aria-label="Title"
      maxLength={200}
      className="w-full resize-none bg-transparent text-[30px] font-[510] leading-[1.15] tracking-[-0.022em] text-fg-hi outline-none placeholder:text-faint sm:text-[34px]"
    />
  );
}

function PreviewPane({ blocks, resolve, roles }: { blocks: BlockNode[]; resolve: ReturnType<typeof catalogResolver>; roles: { id: string; name: string }[] }) {
  const expanded = expandSnippets(blocks, resolve);
  return <SopBody blocks={expanded.blocks} snippets={expanded.snippets} roles={Object.fromEntries(roles.map((r) => [r.id, r.name]))} />;
}

function PublishDialog({ open, onOpenChange, nextVersion, onPublish }: { open: boolean; onOpenChange: (o: boolean) => void; nextVersion: number; onPublish: (summary: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Publish v${nextVersion}`} description="Published versions can't be changed afterwards. Readers see this version straight away.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              if (await onPublish(text)) {
                setText("");
                onOpenChange(false);
              }
            });
          }}
        >
          <Field label="What changed?" htmlFor="change-summary" hint="Required. Shown in the version history, e.g. “Added the breaker table”.">
            <Textarea id="change-summary" value={text} onChange={(e) => setText(e.target.value)} required minLength={3} maxLength={2000} rows={3} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending || text.trim().length < 3}>
              {pending ? "Publishing…" : `Publish v${nextVersion}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
