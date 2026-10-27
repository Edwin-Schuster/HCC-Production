"use client";

import { toast } from "sonner";
import type { Annotation } from "@/blocks/schema";
import { AnnotateDialog } from "./annotate";
import type { SopEditor } from "./schema";
import { storeFor, useEditorStore } from "./store";

/**
 * Opens the annotation editor for the image block chosen from the block menu. The original upload is kept
 * (originalUrl) so annotations stay editable; the block shows the flattened PNG.
 */
export function AnnotateHost({ editor, upload }: { editor: SopEditor; upload: (file: File) => Promise<string> }) {
  const id = useEditorStore(editor, (s) => s.annotating);
  const images = useEditorStore(editor, (s) => s.images);
  const block = id ? editor.getBlock(id) : undefined;
  if (!id || !block || block.type !== "image") return null;
  const extras = images.get(id);
  const src = extras?.originalUrl ?? String((block.props as { url?: string }).url ?? "");
  return (
    <AnnotateDialog
      key={id}
      open
      src={src}
      initial={extras?.annotations ?? []}
      onOpenChange={(o) => !o && storeFor(editor).set({ annotating: null })}
      onSave={async (png: Blob, annotations: Annotation[]) => {
        const url = annotations.length ? await upload(new File([png], "annotated.png", { type: "image/png" })) : src;
        // The editor's snapshot reads this map when it saves, so update it in place before changing the block.
        if (annotations.length) images.set(id, { originalUrl: src, annotations });
        else images.delete(id);
        editor.updateBlock(block, { props: { url } as never });
        toast(annotations.length ? "Annotated image saved" : "Annotations removed");
      }}
    />
  );
}
