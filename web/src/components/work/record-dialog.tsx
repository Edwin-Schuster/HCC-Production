"use client";

import { Camera, Paperclip, Trash2 } from "lucide-react";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { Attachment } from "@/db/schema";
import { cn } from "@/lib/utils";
import { AttachmentList, uploadAttachment } from "./task-drawer";

type Base = { name: string; label: string; hint?: string; required?: boolean; placeholder?: string; wide?: boolean };
export type FieldSpec =
  | (Base & { type: "text" | "email" | "tel" | "date" | "textarea" | "markdown"; list?: string[] })
  | (Base & { type: "number" | "money"; min?: number })
  | (Base & { type: "select"; options: [value: string, label: string][]; empty?: string });

type Values = Record<string, string>;
export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * A create/edit dialog built from a list of fields. Values come back as strings, keyed by name; the caller
 * converts them. With `files`, the record also gets uploads (photos open the camera on phones).
 */
export function RecordDialog({
  open,
  title,
  fields,
  initial,
  files,
  onSave,
  onDelete,
  deleteLabel = "Delete",
  confirmDelete,
  saveLabel = "Save",
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  fields: FieldSpec[];
  initial: Record<string, unknown>;
  files?: { label: string; items: Attachment[]; photos?: boolean };
  onSave: (values: Values, files: Attachment[]) => Promise<ActionResult>;
  onDelete?: () => Promise<ActionResult>;
  deleteLabel?: string;
  confirmDelete?: string;
  saveLabel?: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [pending, start] = useTransition();
  const [attachments, setAttachments] = useState<Attachment[]>(files?.items ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      const added: Attachment[] = [];
      for (const f of Array.from(list)) added.push(await uploadAttachment(f));
      setAttachments((a) => [...a, ...added]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} wide={fields.length > 6}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const values = Object.fromEntries(fields.map((f) => [f.name, String(fd.get(f.name) ?? "").trim()]));
            start(async () => {
              const res = await onSave(values, attachments);
              if (!res.ok) return void toast.error(res.error);
              onClose();
            });
          }}
        >
          <div className={cn("grid gap-4", fields.length > 3 && "sm:grid-cols-2")}>
            {fields.map((f, i) => {
              const id = `rd-${f.name}`;
              const list = "list" in f ? f.list : undefined;
              const common = { id, name: f.name, defaultValue: initial[f.name] === null || initial[f.name] === undefined ? "" : String(initial[f.name]), required: f.required, placeholder: f.placeholder, autoFocus: i === 0 };
              const control =
                f.type === "select" ? (
                  <Select {...common}>
                    {f.empty !== undefined && <option value="">{f.empty}</option>}
                    {f.options.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                ) : f.type === "textarea" || f.type === "markdown" ? (
                  <Textarea {...common} rows={f.type === "markdown" ? 8 : 3} className={f.type === "markdown" ? "font-mono text-[13px]" : undefined} />
                ) : f.type === "number" || f.type === "money" ? (
                  <Input {...common} type="number" min={f.min ?? 0} step={f.type === "money" ? "0.01" : "any"} inputMode="decimal" />
                ) : (
                  <>
                    <Input {...common} type={f.type} list={list ? `${id}-list` : undefined} />
                    {list && (
                      <datalist id={`${id}-list`}>
                        {list.map((o) => (
                          <option key={o} value={o} />
                        ))}
                      </datalist>
                    )}
                  </>
                );
              return (
                <Field key={f.name} label={f.label} htmlFor={id} hint={f.type === "markdown" ? (f.hint ?? "Markdown: ## headings, - lists, **bold**") : f.hint} className={cn((f.wide || f.type === "textarea" || f.type === "markdown") && "sm:col-span-2")}>
                  {control}
                </Field>
              );
            })}
          </div>
          {children}
          {files && (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="flex-1 text-xs font-[510] text-muted">{files.label}</span>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
                <input ref={fileRef} type="file" multiple accept={files.photos ? "image/*,video/*" : undefined} hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
                {files.photos && (
                  <Button type="button" size="xs" variant="ghost" disabled={uploading} onClick={() => cameraRef.current?.click()}>
                    <Camera /> Take photo
                  </Button>
                )}
                <Button type="button" size="xs" variant="ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <Paperclip /> {uploading ? "Uploading…" : "Upload"}
                </Button>
              </div>
              <AttachmentList items={attachments} onRemove={(i) => setAttachments(attachments.filter((_, j) => j !== i))} />
            </div>
          )}
          <div className="flex items-center gap-2">
            {onDelete && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (confirmDelete && !confirm(confirmDelete)) return;
                  start(async () => {
                    const res = await onDelete();
                    if (res.ok) onClose();
                    else toast.error(res.error);
                  });
                }}
              >
                <Trash2 /> {deleteLabel}
              </Button>
            )}
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending || uploading}>
              {saveLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const num = (v: string) => (v === "" ? 0 : Number(v));
export const orNull = (v: string) => v || null;
