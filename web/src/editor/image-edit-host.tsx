"use client";

import { toast } from "sonner";
import { flatten } from "./annotate";
import { cropImage, ImageEditDialog, remapAnnotations } from "./image-edit";
import type { SopEditor } from "./schema";
import { storeFor, useEditorStore } from "./store";

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("export failed"))), "image/png"));

/**
 * Opens "Resize & crop" for the image block chosen from the block menu. Cropping makes a new upload from the
 * original (so annotations are redrawn on the cropped image, never cropped twice); the size is the block's width.
 */
export function ImageEditHost({ editor, upload }: { editor: SopEditor; upload: (file: File) => Promise<string> }) {
  const id = useEditorStore(editor, (s) => s.resizing);
  const images = useEditorStore(editor, (s) => s.images);
  const block = id ? editor.getBlock(id) : undefined;
  if (!id || !block || block.type !== "image") return null;
  const props = block.props as { url?: string; previewWidth?: number };
  const extras = images.get(id);
  const src = extras?.originalUrl ?? String(props.url ?? "");
  return (
    <ImageEditDialog
      key={id}
      open
      src={src}
      width={typeof props.previewWidth === "number" && props.previewWidth < 4000 ? Math.round(props.previewWidth) : null}
      canCrop={src.startsWith("/")}
      onOpenChange={(o) => !o && storeFor(editor).set({ resizing: null })}
      onSave={async ({ width, crop, img }) => {
        try {
          // "Full width" is stored as the largest width; the reader caps every image at the page width.
          const patch: { previewWidth: number; url?: string } = { previewWidth: width ?? 4000 };
          if (crop && img) {
            const type = /\.jpe?g($|\?)/i.test(src) ? "image/jpeg" : "image/png";
            const base = await upload(new File([await cropImage(img, crop, type)], type === "image/jpeg" ? "cropped.jpg" : "cropped.png", { type }));
            const annotations = extras ? remapAnnotations(extras.annotations, crop) : [];
            if (annotations.length) {
              const flat = flatten(await loadImage(base), annotations);
              patch.url = await upload(new File([await toBlob(flat)], "annotated.png", { type: "image/png" }));
              images.set(id, { originalUrl: base, annotations });
            } else {
              patch.url = base;
              images.delete(id);
            }
          }
          editor.updateBlock(block, { props: patch as never });
          toast(crop ? "Image cropped" : "Image resized");
        } catch {
          toast.error("Couldn't save the image. Try again.");
          throw new Error("save failed");
        }
      }}
    />
  );
}
