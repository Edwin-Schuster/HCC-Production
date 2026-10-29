"use client";

import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { getDefaultReactSlashMenuItems, useBlockNoteEditor, useComponentsContext, useEditorState, useExtensionState, type DefaultReactSuggestionItem } from "@blocknote/react";
import { AlertTriangle, CornerDownRight, Crop, Film, Globe, Info, ListOrdered, OctagonAlert, Puzzle } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { SopEditor } from "./schema";
import { storeFor } from "./store";

/** Slash menu: our structured blocks first, then BlockNote's items for the built-in types we support. */
export function slashItems(editor: SopEditor, opts: { snippets?: boolean } = {}): DefaultReactSuggestionItem[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insert = (block: any) => () => insertOrUpdateBlockForSlashMenu(editor, block);
  const ours: DefaultReactSuggestionItem[] = [
    { title: "Step", subtext: "Numbered step with role, time, expected result and warning", aliases: ["step", "procedure", "numbered", "1."], group: "SOP", icon: <ListOrdered size={18} />, onItemClick: insert({ type: "step" }) },
    {
      title: "Sub-step",
      subtext: "Step nested under the one above (3.1, 3.2)",
      aliases: ["substep", "nested", "child"],
      group: "SOP",
      icon: <CornerDownRight size={18} />,
      onItemClick: () => {
        const b = insertOrUpdateBlockForSlashMenu(editor, { type: "step" });
        editor.setTextCursorPosition(b, "end");
        if (editor.canNestBlock()) editor.nestBlock();
      },
    },
    { title: "Note callout", subtext: "Helpful information", aliases: ["note", "info", "callout", "tip"], group: "SOP", icon: <Info size={18} />, onItemClick: insert({ type: "callout", props: { variant: "info" } }) },
    { title: "Warning callout", subtext: "Something that could go wrong", aliases: ["warning", "caution", "callout"], group: "SOP", icon: <AlertTriangle size={18} />, onItemClick: insert({ type: "callout", props: { variant: "warning" } }) },
    { title: "Danger callout", subtext: "Risk to people or equipment", aliases: ["danger", "stop", "callout"], group: "SOP", icon: <OctagonAlert size={18} />, onItemClick: insert({ type: "callout", props: { variant: "danger" } }) },
    { title: "Snippet", subtext: "Insert a shared block of steps used in several SOPs", aliases: ["snippet", "reuse", "shared", "include"], group: "SOP", icon: <Puzzle size={18} />, onItemClick: insert({ type: "snippet" }) },
  ];
  // Grouped with BlockNote's own Media items (the menu needs each group's items to be adjacent).
  const media: DefaultReactSuggestionItem[] = [
    { title: "Video", subtext: "YouTube, Vimeo or an uploaded video", aliases: ["video", "youtube", "vimeo", "movie"], group: "Media", icon: <Film size={18} />, onItemClick: insert({ type: "video" }) },
    { title: "Embed", subtext: "Show another web page inside the SOP", aliases: ["embed", "iframe", "web", "page"], group: "Media", icon: <Globe size={18} />, onItemClick: insert({ type: "embed" }) },
  ];
  const builtIn = getDefaultReactSlashMenuItems(editor).filter((i) => !/emoji|video|audio|file|quote|toggle/i.test(i.title));
  const lastMedia = builtIn.findLastIndex((i) => i.group === "Media");
  const withMedia = lastMedia >= 0 ? [...builtIn.slice(0, lastMedia + 1), ...media, ...builtIn.slice(lastMedia + 1)] : [...builtIn, ...media];
  return [...ours.filter((i) => opts.snippets !== false || i.title !== "Snippet"), ...withMedia];
}

export const getSlashItems = (editor: SopEditor, opts?: { snippets?: boolean }) => async (query: string) => filterSuggestionItems(slashItems(editor, opts), query);

function useSideMenuBlock() {
  const editor = useBlockNoteEditor<never, never, never>() as unknown as SopEditor;
  const block = useExtensionState(SideMenuExtension, { editor: editor as never, selector: (s: { block?: { id: string } } | undefined) => s?.block });
  return { editor, block };
}

/** Removes ids recursively so BlockNote assigns fresh ones to a duplicate. */
function withoutIds(b: { id?: string; children?: unknown[] } & Record<string, unknown>): Record<string, unknown> {
  const { id: _id, children, ...rest } = b;
  return { ...rest, children: (children as Record<string, unknown>[] | undefined)?.map((c) => withoutIds(c as never)) ?? [] };
}

export function DuplicateItem({ children }: { children: ReactNode }) {
  const Components = useComponentsContext()!;
  const { editor, block } = useSideMenuBlock();
  if (!block) return null;
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => {
        const current = editor.getBlock(block.id);
        if (current) editor.insertBlocks([withoutIds(current as never) as never], current, "after");
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  );
}

export function AnnotateItem() {
  const Components = useComponentsContext()!;
  const { editor, block } = useSideMenuBlock();
  const current = block ? editor.getBlock(block.id) : undefined;
  if (!current || current.type !== "image" || !(current.props as { url?: string }).url) return null;
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => {
        const extras = storeFor(editor).get().images.get(current.id);
        const src = extras?.originalUrl ?? String((current.props as { url?: string }).url);
        // A linked (other-site) image can't be read back from a canvas, so only uploads can be annotated.
        if (!src.startsWith("/")) return void toast.error("Only uploaded images can be annotated. Upload the screenshot instead of linking to it.");
        storeFor(editor).set({ annotating: current.id });
      }}
    >
      Annotate image
    </Components.Generic.Menu.Item>
  );
}

export function ResizeItem() {
  const Components = useComponentsContext()!;
  const { editor, block } = useSideMenuBlock();
  const current = block ? editor.getBlock(block.id) : undefined;
  if (!current || current.type !== "image" || !(current.props as { url?: string }).url) return null;
  return (
    <Components.Generic.Menu.Item className="bn-menu-item" onClick={() => storeFor(editor).set({ resizing: current.id })}>
      Resize & crop image
    </Components.Generic.Menu.Item>
  );
}

/** "Resize & crop" in the toolbar that appears when an image is selected. */
export function ResizeButton() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor<never, never, never>() as unknown as SopEditor;
  const id = useEditorState({
    editor: editor as never,
    selector: ({ editor: e }) => {
      const ed = e as unknown as SopEditor;
      if (!ed.isEditable) return undefined;
      const blocks = ed.getSelection()?.blocks ?? [ed.getTextCursorPosition().block];
      const b = blocks.length === 1 ? blocks[0] : undefined;
      return b && b.type === "image" && (b.props as { url?: string }).url ? b.id : undefined;
    },
  });
  if (!id) return null;
  return (
    <Components.FormattingToolbar.Button className="bn-button" label="Resize & crop" mainTooltip="Resize & crop" icon={<Crop size={18} />} onClick={() => storeFor(editor).set({ resizing: id })} />
  );
}

export function CollapseItem() {
  const Components = useComponentsContext()!;
  const { editor, block } = useSideMenuBlock();
  const current = block ? editor.getBlock(block.id) : undefined;
  if (!current || current.type !== "step") return null;
  const collapsed = Boolean((current.props as { collapsed?: boolean }).collapsed);
  return (
    <Components.Generic.Menu.Item className="bn-menu-item" onClick={() => editor.updateBlock(current, { props: { collapsed: !collapsed } as never })}>
      {collapsed ? "Expand step" : "Collapse step"}
    </Components.Generic.Menu.Item>
  );
}
