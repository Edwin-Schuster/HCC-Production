"use client";

import { useState, useTransition } from "react";
import { createSopAction } from "@/app/actions/sops";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Props = {
  folders: { id: string; label: string; prefix: string }[];
  templates: { key: string; name: string; description: string }[];
  defaultFolder?: string;
};

export function NewSopForm({ folders, templates, defaultFolder }: Props) {
  const [template, setTemplate] = useState("standard");
  const [folderId, setFolderId] = useState(defaultFolder && folders.some((f) => f.id === defaultFolder) ? defaultFolder : folders[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const prefix = folders.find((f) => f.id === folderId)?.prefix;

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const res = await createSopAction({
            title: String(fd.get("title") ?? ""),
            folderId,
            summary: String(fd.get("summary") ?? ""),
            templateKey: template || undefined,
            tags: String(fd.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
          });
          if (res && !res.ok) setError(res.error);
        });
      }}
    >
      <fieldset>
        <legend className="mb-2 text-xs font-[510] text-muted">Template</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <label
              key={t.key}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-[12px] border bg-surface p-4 transition-colors hover:border-line-2",
                template === t.key ? "border-fg-2 bg-surface-2" : "border-line",
              )}
            >
              <input type="radio" name="template" value={t.key} checked={template === t.key} onChange={() => setTemplate(t.key)} className="sr-only" />
              <span className="text-[14px] font-[510] text-fg-hi">{t.name}</span>
              <span className="text-[13px] text-muted">{t.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="title" className="sm:col-span-2">
          <Input id="title" name="title" required maxLength={200} placeholder="e.g. Sunday System Startup" autoFocus className="h-10 text-[15px]" />
        </Field>
        <Field label="Folder" htmlFor="folder" hint={prefix ? `Document code will be SOP-${prefix}-###` : undefined}>
          <Select id="folder" value={folderId} onChange={(e) => setFolderId(e.target.value)} required>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tags" htmlFor="tags" hint="Comma separated, e.g. audio, sunday">
          <Input id="tags" name="tags" placeholder="audio, sunday" />
        </Field>
        <Field label="Summary" htmlFor="summary" className="sm:col-span-2">
          <Textarea id="summary" name="summary" rows={2} maxLength={1000} placeholder="One sentence: what this procedure is for." />
        </Field>
      </div>
      {error && (
        <p role="alert" className="rounded-[6px] border border-bad/40 bg-bad-soft px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="submit" variant="primary" size="lg" disabled={pending || !folderId}>
          {pending ? "Creating…" : "Create and start writing"}
        </Button>
      </div>
    </form>
  );
}
