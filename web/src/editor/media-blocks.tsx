"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { Film, Globe, Pin, PinOff, Puzzle, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { videoEmbedUrl } from "@/blocks/media";
import { SopBody } from "@/blocks/render";
import { cn } from "@/lib/utils";
import { useEditorStore } from "./store";

/**
 * Video, embed and snippet blocks. Each starts as a small form (paste a link, pick a snippet)
 * and then shows the same preview readers will see.
 */

const inputCls = "min-w-0 flex-1 rounded-[6px] border border-line bg-transparent px-2.5 py-1.5 text-[14px] text-fg-2 outline-none placeholder:text-faint focus:border-line-2";

function UrlForm({ icon, placeholder, hint, onSubmit, onUpload }: { icon: React.ReactNode; placeholder: string; hint: string; onSubmit: (url: string) => void; onUpload?: (f: File) => Promise<void> }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const submit = () => {
    const url = v.trim();
    if (!/^https:\/\//i.test(url)) return setError("Use an https:// link.");
    onSubmit(url);
  };
  return (
    <div contentEditable={false} className="rounded-[8px] border border-dashed border-line-2 p-3">
      <div className="flex items-center gap-2">
        <span className="text-muted">{icon}</span>
        <input
          value={v}
          onChange={(e) => {
            setV(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className={inputCls}
        />
        <button type="button" onClick={submit} className="rounded-[6px] bg-wash px-2.5 py-1.5 text-[13px] text-fg-hi hover:bg-wash-2">
          Add
        </button>
        {onUpload && (
          <>
            <button type="button" disabled={busy} onClick={() => file.current?.click()} className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-[13px] text-muted hover:bg-wash hover:text-fg-hi">
              <Upload className="size-3.5" /> {busy ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={file}
              type="file"
              accept="video/mp4,video/webm"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try {
                  await onUpload(f);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Upload failed");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </>
        )}
      </div>
      <p className={cn("mt-1.5 text-xs", error ? "text-urgent" : "text-faint")}>{error || hint}</p>
    </div>
  );
}

export const VideoBlock = createReactBlockSpec(
  { type: "video", propSchema: { url: { default: "" }, caption: { default: "" } }, content: "none" },
  {
    render: function VideoView({ block, editor }) {
      const { url, caption } = block.props;
      const set = (props: Partial<typeof block.props>) => editor.updateBlock(block, { props: props as never });
      if (!url)
        return (
          <UrlForm
            icon={<Film className="size-4" />}
            placeholder="Paste a YouTube, Vimeo or .mp4 link"
            hint="Or upload an MP4 or WebM file."
            onSubmit={(u) => set({ url: u })}
            onUpload={async (f) => {
              const u = (await editor.uploadFile?.(f, block.id)) as string | undefined;
              if (u) set({ url: u });
            }}
          />
        );
      const embedUrl = videoEmbedUrl(url);
      return (
        <figure contentEditable={false} className="w-full">
          {embedUrl ? (
            <div className="relative aspect-video overflow-hidden rounded-[12px] border border-line bg-surface">
              <iframe src={embedUrl} title={caption || "Video"} className="absolute inset-0 size-full" allow="encrypted-media; picture-in-picture; fullscreen" />
            </div>
          ) : (
            <video src={url} controls preload="metadata" className="block w-full rounded-[12px] border border-line bg-black" />
          )}
          <CaptionInput value={caption} onChange={(c) => set({ caption: c })} placeholder="Add a caption" />
        </figure>
      );
    },
  },
);

export const EmbedBlock = createReactBlockSpec(
  { type: "embed", propSchema: { url: { default: "" }, title: { default: "" }, height: { default: 480 } }, content: "none" },
  {
    render: function EmbedView({ block, editor }) {
      const { url, title, height } = block.props;
      const set = (props: Partial<typeof block.props>) => editor.updateBlock(block, { props: props as never });
      if (!url) return <UrlForm icon={<Globe className="size-4" />} placeholder="Paste a link to embed (Google Slides, a form, a dashboard…)" hint="The page must allow embedding. It runs sandboxed." onSubmit={(u) => set({ url: u })} />;
      return (
        <figure contentEditable={false} className="w-full">
          <iframe src={url} title={title || "Embedded page"} style={{ height }} className="block w-full rounded-[12px] border border-line bg-surface" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerPolicy="no-referrer" />
          <div className="mt-1 flex items-center gap-2">
            <CaptionInput value={title} onChange={(t) => set({ title: t })} placeholder="Title" />
            <select value={height} onChange={(e) => set({ height: Number(e.target.value) })} aria-label="Height" className="rounded-[4px] bg-transparent text-xs text-muted outline-none">
              {[240, 360, 480, 640, 800].map((h) => (
                <option key={h} value={h}>
                  {h}px tall
                </option>
              ))}
            </select>
          </div>
        </figure>
      );
    },
  },
);

function CaptionInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState(value);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value.slice(0, 1000))}
      onBlur={() => v !== value && onChange(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      placeholder={placeholder}
      className="mt-1.5 w-full bg-transparent text-center text-[12.5px] text-muted outline-none placeholder:text-faint"
    />
  );
}

export const SnippetBlock = createReactBlockSpec(
  { type: "snippet", propSchema: { snippetId: { default: "" }, version: { default: 0 } }, content: "none" },
  {
    render: function SnippetView({ block, editor }) {
      const catalog = useEditorStore(editor, (s) => s.snippets);
      const roles = useEditorStore(editor, (s) => s.roles);
      const { snippetId, version } = block.props;
      const set = (props: Partial<typeof block.props>) => editor.updateBlock(block, { props: props as never });
      const item = catalog.find((c) => c.id === snippetId);
      if (!snippetId || !item)
        return (
          <div contentEditable={false} className="flex w-full flex-wrap items-center gap-2 rounded-[8px] border border-dashed border-line-2 p-3 text-[14px]">
            <Puzzle className="size-4 text-muted" aria-hidden />
            {catalog.length ? (
              <select defaultValue="" onChange={(e) => set({ snippetId: e.target.value, version: 0 })} aria-label="Snippet" className="rounded-[6px] border border-line bg-transparent px-2 py-1 outline-none">
                <option value="" disabled>
                  {snippetId ? "That snippet was deleted. Pick another…" : "Pick a snippet…"}
                </option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-muted">
                No snippets yet. Create them under <a href="/snippets" className="underline underline-offset-2">Snippets</a>.
              </span>
            )}
          </div>
        );
      const shown = version || item.currentVersion;
      const blocks = item.versions[shown] ?? item.versions[item.currentVersion] ?? [];
      return (
        <div contentEditable={false} className="hcc-snippet w-full rounded-[8px] border border-line bg-surface/50 px-4 py-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted">
            <Puzzle className="size-3.5" aria-hidden />
            <span className="font-[510] text-fg-2">{item.name}</span>
            <span className="font-mono">{version ? `pinned v${version}` : `latest · v${item.currentVersion}`}</span>
            <span className="flex-1" />
            {version ? (
              <button type="button" onClick={() => set({ version: 0 })} className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 hover:bg-wash hover:text-fg-hi" title="Always show the latest version of this snippet">
                <PinOff className="size-3" /> Follow latest
              </button>
            ) : (
              <button type="button" onClick={() => set({ version: item.currentVersion })} className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 hover:bg-wash hover:text-fg-hi" title="Keep this exact version even if the snippet changes">
                <Pin className="size-3" /> Pin v{item.currentVersion}
              </button>
            )}
          </div>
          <SopBody blocks={blocks} roles={Object.fromEntries(roles.map((r) => [r.id, r.name]))} className="pointer-events-none text-[14px] opacity-90 [&_.sop-step]:my-3" />
          <p className="mt-1 text-[11px] text-faint">Shared snippet. Edit it on the Snippets page; step numbers continue around it.</p>
        </div>
      );
    },
  },
);
