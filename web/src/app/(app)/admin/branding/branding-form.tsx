"use client";

import { Upload, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateBrandingAction } from "@/app/actions/admin";
import type { Branding } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export function BrandingForm({ initial }: { initial: Branding }) {
  const [b, setB] = useState({
    logoUrl: initial.logoUrl ?? "",
    primaryColor: initial.primaryColor ?? "",
    font: initial.font ?? "default",
    headerText: initial.headerText ?? "",
    footerText: initial.footerText ?? "",
  });
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<typeof b>) => setB((x) => ({ ...x, ...patch }));
  const color = /^#[0-9a-f]{6}$/i.test(b.primaryColor) ? b.primaryColor : null;
  const fontFamily = b.font === "serif" ? "var(--font-serif), Georgia, serif" : b.font === "system" ? "ui-sans-serif, system-ui, sans-serif" : undefined;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <form
        className="grid content-start gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await updateBrandingAction({ ...b, font: b.font as "default" | "serif" | "system" });
            if (res.ok) toast("Branding saved");
            else toast.error(res.error);
          });
        }}
      >
        <Field label="Logo" hint="Shown at the top of every SOP and PDF. PNG, JPEG or WebP.">
          <div className="flex items-center gap-3">
            {b.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded logo preview
              <img src={b.logoUrl} alt="Logo preview" className="h-10 w-auto max-w-[180px] rounded-[4px] border border-line bg-white/5 object-contain p-1" />
            ) : (
              <span className="text-[13px] text-muted">No logo</span>
            )}
            <Button type="button" size="sm" disabled={uploading} onClick={() => file.current?.click()}>
              <Upload /> {uploading ? "Uploading…" : "Upload"}
            </Button>
            {b.logoUrl && (
              <Button type="button" size="sm" variant="ghost" onClick={() => set({ logoUrl: "" })}>
                <X /> Remove
              </Button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                const fd = new FormData();
                fd.append("file", f);
                const r = await fetch("/api/files", { method: "POST", body: fd });
                const j = await r.json().catch(() => ({}));
                setUploading(false);
                if (!r.ok) return void toast.error(j.error ?? "Upload failed");
                set({ logoUrl: j.url });
              }}
            />
          </div>
        </Field>
        <Field label="Accent colour" htmlFor="color" hint="Used for step numbers, links and the header rule in SOPs.">
          <div className="flex items-center gap-2">
            <input type="color" value={color ?? "#888888"} onChange={(e) => set({ primaryColor: e.target.value })} className="size-9 cursor-pointer rounded-[6px] border border-line bg-transparent" aria-label="Pick colour" />
            <Input id="color" value={b.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} placeholder="#3b82f6" className="w-32 font-mono" />
            {b.primaryColor && (
              <Button type="button" size="sm" variant="ghost" onClick={() => set({ primaryColor: "" })}>
                Clear
              </Button>
            )}
          </div>
        </Field>
        <Field label="SOP font" htmlFor="font">
          <Select id="font" value={b.font} onChange={(e) => set({ font: e.target.value as typeof b.font })}>
            <option value="default">App font</option>
            <option value="serif">Serif (Source Serif)</option>
            <option value="system">Device system font</option>
          </Select>
        </Field>
        <Field label="Header text" htmlFor="header" hint="Above the title, and at the top of every PDF page.">
          <Input id="header" value={b.headerText} onChange={(e) => set({ headerText: e.target.value })} maxLength={120} placeholder="Hope Christian Church · Production" />
        </Field>
        <Field label="Footer text" htmlFor="footer" hint="At the end of each SOP and the bottom of every PDF page.">
          <Input id="footer" value={b.footerText} onChange={(e) => set({ footerText: e.target.value })} maxLength={200} placeholder="Questions? Ask the TD on duty." />
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Save branding"}
          </Button>
        </div>
      </form>

      <aside aria-label="Preview" className="self-start rounded-[12px] border border-line bg-surface p-5" data-brand={color ? "" : undefined} style={color ? ({ "--brand": color } as React.CSSProperties) : undefined}>
        <p className="mb-3 text-xs text-muted">Preview</p>
        <div className="sop-header border-b border-line pb-4" style={{ fontFamily }}>
          <div className="mb-3 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- preview */}
            {b.logoUrl && <img src={b.logoUrl} alt="" className="h-6 w-auto max-w-[120px] object-contain" />}
            {b.headerText && <span className="text-[11px] font-[510] uppercase tracking-[0.06em] text-muted">{b.headerText}</span>}
          </div>
          <p className="text-xl font-[510] text-fg-hi">Sunday System Startup</p>
        </div>
        <div className="sop-body mt-4 grid gap-3 text-[14px]" style={{ fontFamily }}>
          {["Unlock the booth", "Power the stage racks"].map((t, i) => (
            <div key={t} className="flex items-center gap-3">
              <span data-top="" className="sop-step-num flex h-[24px] min-w-[24px] items-center justify-center rounded-full border border-line-2 bg-surface-2 font-mono text-xs text-fg-hi">
                {i + 1}
              </span>
              <span className="text-fg-hi">{t}</span>
            </div>
          ))}
          <a href="#" className="text-fg-hi underline underline-offset-2" onClick={(e) => e.preventDefault()}>
            A link in the SOP
          </a>
        </div>
        {b.footerText && <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{b.footerText}</p>}
      </aside>
    </div>
  );
}
