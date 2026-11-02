"use client";

import { AlertTriangle, FileUp, RotateCcw } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { createFromImportAction } from "@/app/actions/sops";
import { SopBody } from "@/blocks/render";
import type { BlockNode } from "@/blocks/schema";
import { walk } from "@/blocks/tree";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Preview = { title: string; summary: string; tags: string[]; folderId: string | null; blocks: BlockNode[]; warnings: string[]; fileName: string };
const ACCEPT = ".docx,.md,.markdown,.txt,.html,.htm,.zip";

export function ImportForm({ folders, roles }: { folders: { id: string; label: string }[]; roles: Record<string, string> }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [folderId, setFolderId] = useState(folders[0]?.id ?? "");
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/import", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({ error: "The server couldn't read that file." }));
    setBusy(false);
    if (!r.ok) return setError(j.error);
    setPreview(j);
    setTitle(j.title);
    setSummary(j.summary ?? "");
    setTags((j.tags ?? []).join(", "));
    if (j.folderId) setFolderId(j.folderId);
  };

  if (!preview)
    return (
      <div className="grid gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) void upload(f);
          }}
          className={cn("grid place-items-center gap-2 rounded-[12px] border border-dashed px-6 py-16 text-center transition-colors", dragging ? "border-fg-2 bg-surface-2" : "border-line-2 hover:bg-surface")}
        >
          <FileUp className="size-6 text-muted" />
          <span className="text-[15px] font-[510] text-fg-hi">{busy ? "Converting…" : "Drop a document here, or choose a file"}</span>
          <span className="text-[13px] text-muted">.docx, Markdown (.md), an SOP package (.zip of Markdown and images), HTML, or a Google Docs web-page export (.zip)</span>
        </button>
        <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        {error && (
          <p className="rounded-[6px] border border-bad/40 bg-bad-soft px-3 py-2 text-[13px] text-fg-2" role="alert">
            {error}
          </p>
        )}
        <p className="text-[13px] text-muted">From Google Docs: File → Download → Microsoft Word (.docx). Word styles “Heading 1/2/3” become sections; paragraphs starting “Warning:”, “Danger:” or “Note:” become callouts.</p>
        <p className="text-[13px] text-muted">
          For the most faithful import, use SOP Markdown: steps keep their role, time, expected result, warning and “go to step” rules, and images keep their size and caption when you zip them with the file.{" "}
          <a href="/sop-markdown-guide.md" download className="text-fg-hi underline underline-offset-2">
            Download the format guide
          </a>
          , which is itself an example you can import.
        </p>
      </div>
    );

  const steps = [...walk(preview.blocks)].filter((x) => x.node.type === "step").length;
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <form
        className="grid content-start gap-4 lg:sticky lg:top-6"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await createFromImportAction({
              title,
              folderId,
              summary,
              tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20),
              blocks: preview.blocks,
              fileName: preview.fileName,
            });
            if (res && !res.ok) setError(res.error);
          });
        }}
      >
        <p className="text-[13px] text-muted">
          <span className="text-fg-hi">{preview.fileName}</span> · {preview.blocks.length} blocks, {steps} steps
        </p>
        {preview.warnings.map((w) => (
          <p key={w} className="flex gap-2 rounded-[6px] border border-warn/30 bg-warn-soft px-3 py-2 text-[13px] text-fg-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" /> {w}
          </p>
        ))}
        <Field label="Title" htmlFor="title">
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
        </Field>
        <Field label="Summary" htmlFor="summary">
          <Input id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1000} />
        </Field>
        <Field label="Tags" htmlFor="tags" hint="Comma separated">
          <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <Field label="Folder" htmlFor="folder">
          <Select id="folder" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        {error && (
          <p className="text-[13px] text-bad" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
            <RotateCcw /> Another file
          </Button>
          <Button type="submit" variant="primary" disabled={pending || !title.trim()}>
            {pending ? "Creating…" : "Create draft"}
          </Button>
        </div>
        <p className="text-xs text-faint">The SOP is created as a draft and opens in the editor. Nothing is published.</p>
      </form>
      <div className="min-w-0 rounded-[12px] border border-line bg-surface px-5 py-6 sm:px-8">
        <h2 className="mb-6 text-[26px] font-[510] tracking-[-0.02em] text-fg-hi">{title}</h2>
        <SopBody blocks={preview.blocks} roles={roles} />
      </div>
    </div>
  );
}
