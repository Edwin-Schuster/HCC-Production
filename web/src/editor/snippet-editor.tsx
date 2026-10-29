"use client";

import "@blocknote/mantine/style.css";
import "./editor.css";
import { BlockNoteView } from "@blocknote/mantine";
import { DragHandleMenu, FormattingToolbar, FormattingToolbarController, getFormattingToolbarItems, RemoveBlockItem, SideMenu, SideMenuController, SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createSnippetAction, deleteSnippetAction, updateSnippetAction } from "@/app/actions/snippets";
import type { BlockNode } from "@/blocks/schema";
import { numberSteps, plain, walk } from "@/blocks/tree";
import { useTheme } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { fromBlockNote, imageExtras, keyMap, toBlockNote, type BNBlock } from "./convert";
import { AnnotateItem, CollapseItem, DuplicateItem, getSlashItems, ResizeButton, ResizeItem, RestartItem } from "./menu-items";
import { AnnotateHost } from "./annotate-host";
import { SelectionGuard } from "./selection-guard";
import { ImageEditHost } from "./image-edit-host";
import { sopSchema, type SopEditor as Editor } from "./schema";
import { storeFor } from "./store";

export type SnippetEditorProps = {
  snippet: { id: string; name: string; description: string; currentVersion: number; blocks: BlockNode[] } | null;
  roles: { id: string; name: string }[];
  canDelete: boolean;
};

/** Snippets are saved explicitly: each save is a new version, which SOPs following the snippet show at once. */
export default function SnippetEditor({ snippet, roles, canDelete }: SnippetEditorProps) {
  const initial = useMemo(() => snippet?.blocks ?? [], [snippet]);
  const keys = useMemo(() => keyMap(initial), [initial]);
  const images = useMemo(() => imageExtras(initial), [initial]);
  const [name, setName] = useState(snippet?.name ?? "");
  const [description, setDescription] = useState(snippet?.description ?? "");
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const theme = useTheme() ?? "dark";

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
    { extensions: [SelectionGuard], schema: sopSchema, initialContent: initial.length ? (toBlockNote(initial) as never) : undefined, uploadFile, tables: { headers: true }, animations: false },
    [],
  ) as unknown as Editor;

  const snapshot = useCallback(() => fromBlockNote(editor.document as unknown as BNBlock[], keys, images), [editor, keys, images]);
  const renumber = useCallback(() => {
    const tree = snapshot();
    const numbers = numberSteps(tree);
    const steps = [];
    for (const { node } of walk(tree)) if (node.type === "step") steps.push({ key: node.key, number: numbers.get(node.id) ?? "", title: plain(node.content.title) });
    storeFor(editor).set({ numbers, steps });
  }, [editor, snapshot]);

  useEffect(() => {
    storeFor(editor).set({ roles, images, keyOf: (id) => keys.get(id) ?? id });
    renumber();
  }, [editor, roles, images, keys, renumber]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () =>
    start(async () => {
      const input = { name, description, blocks: snapshot() };
      const res = snippet ? await updateSnippetAction(snippet.id, input) : await createSnippetAction(input);
      if (!res.ok) return void toast.error(res.error);
      setDirty(false);
      if (snippet && "version" in res.data) {
        const n = res.data.affectedSops;
        toast(`Saved v${res.data.version}${n ? `. ${n} published SOP${n === 1 ? "" : "s"} now show this version.` : ""}`);
      }
    });

  return (
    <div className="mx-auto max-w-[860px] px-[max(16px,env(safe-area-inset-left))] pb-32 pt-4 sm:px-6">
      <div className="flex items-center gap-2 py-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/snippets">
            <ArrowLeft /> Snippets
          </Link>
        </Button>
        <span className="flex-1" />
        {snippet && <span className="font-mono text-xs text-faint">v{snippet.currentVersion}</span>}
        {snippet && canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              confirm("Delete this snippet? It must not be used by any SOP.") &&
              start(async () => {
                const res = await deleteSnippetAction(snippet.id);
                if (!res.ok) toast.error(res.error);
              })
            }
          >
            <Trash2 /> Delete
          </Button>
        )}
        <Button variant="primary" size="sm" disabled={pending || !name.trim() || (!dirty && Boolean(snippet))} onClick={save}>
          {pending ? "Saving…" : snippet ? "Save new version" : "Create snippet"}
        </Button>
      </div>
      <div className="mt-6 sm:pl-[54px]">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value.slice(0, 120));
            setDirty(true);
          }}
          placeholder="Snippet name, e.g. Amp power-down"
          aria-label="Name"
          autoFocus={!snippet}
          className="w-full bg-transparent text-[28px] font-[510] tracking-[-0.02em] text-fg-hi outline-none placeholder:text-faint"
        />
        <input
          value={description}
          onChange={(e) => {
            setDescription(e.target.value.slice(0, 500));
            setDirty(true);
          }}
          placeholder="When to use it"
          aria-label="Description"
          className="mt-2 w-full bg-transparent text-[15px] text-fg-2 outline-none placeholder:text-faint"
        />
      </div>
      <div className="mt-6">
        <BlockNoteView
          editor={editor as never}
          theme={theme}
          slashMenu={false}
          sideMenu={false}
          formattingToolbar={false}
          onChange={() => {
            renumber();
            setDirty(true);
          }}
          className="hcc-editor"
        >
          <SuggestionMenuController triggerCharacter="/" getItems={getSlashItems(editor, { snippets: false })} />
          <FormattingToolbarController formattingToolbar={() => <FormattingToolbar>{[...getFormattingToolbarItems(), <ResizeButton key="resize" />]}</FormattingToolbar>} />
          <SideMenuController
            sideMenu={(props) => (
              <SideMenu
                {...props}
                dragHandleMenu={() => (
                  <DragHandleMenu>
                    <DuplicateItem>Duplicate</DuplicateItem>
                    <CollapseItem />
                    <RestartItem />
                    <ResizeItem />
                    <AnnotateItem />
                    <RemoveBlockItem>Delete</RemoveBlockItem>
                  </DragHandleMenu>
                )}
              />
            )}
          />
        </BlockNoteView>
        <AnnotateHost editor={editor} upload={uploadFile} />
        <ImageEditHost editor={editor} upload={uploadFile} />
      </div>
    </div>
  );
}
