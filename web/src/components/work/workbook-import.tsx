"use client";

import { FileSpreadsheet, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createProjectFromWorkbookAction, importWorkbookAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { formatMoney } from "@/lib/format";
import { duplicateIps } from "@/lib/network";
import { contractorGroups, defaultCableTab, readWorkbook, type Workbook } from "@/lib/project-workbook";
import { readXlsx } from "@/lib/xlsx";

/** "HCC PRODUCTION - 2027 Building Project.xlsx" → "2027 Building Project". */
const nameFromFile = (f: string) => f.replace(/\.xlsx$/i, "").split(/\s+[-–—_]+\s+/).pop()!.replace(/_/g, " ").trim();
const dollars = (n: number) => formatMoney(Math.round(n * 100), { cents: Math.round(n * 100) % 100 !== 0 });

/**
 * Imports a project workbook: budget summary, item tabs, a cable schedule and a network plan. With a
 * projectId it updates that project; without, it starts a new one.
 */
export function WorkbookImportButton({ projectId, label = "Import workbook" }: { projectId?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant={projectId ? "ghost" : "secondary"} onClick={() => setOpen(true)}>
        <FileSpreadsheet /> {label}
      </Button>
      {open && <WorkbookDialog projectId={projectId} onClose={() => setOpen(false)} />}
    </>
  );
}

function WorkbookDialog({ projectId, onClose }: { projectId?: string; onClose: () => void }) {
  const router = useRouter();
  const [wb, setWb] = useState<Workbook | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [use, setUse] = useState({ budget: true, items: true, cables: true, ports: true });
  const [contractors, setContractors] = useState<string[]>([]);
  const [cableTab, setCableTab] = useState(0);

  const pick = async (file: File) => {
    setError(null);
    try {
      const read = readWorkbook(readXlsx(new Uint8Array(await file.arrayBuffer())));
      if (!read.budget.length && !read.items.length && !read.cableTabs.length && !read.ports.length) throw new Error("None of this workbook's tabs look like a budget, an item list, a cable schedule or a network plan.");
      setWb(read);
      setName(nameFromFile(file.name));
      setContractors(contractorGroups(read));
      setCableTab(Math.max(0, defaultCableTab(read)));
    } catch (e) {
      setWb(null);
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };

  const toggle = (k: keyof typeof use) => setUse({ ...use, [k]: !use[k] });
  const sources = wb ? [...new Set(wb.budget.map((b) => b.source).filter(Boolean))] : [];
  const itemTabs = wb ? wb.tabs.filter((t) => t.kind === "items") : [];
  const switches = wb ? [...new Set(wb.ports.map((p) => p.switchName))] : [];
  const dupes = wb ? duplicateIps(wb.ports.map((p, i) => ({ ...p, id: String(i) }))) : new Map();

  const submit = () =>
    start(async () => {
      if (!wb) return;
      const payload = {
        budget: use.budget ? wb.budget : [],
        items: use.items ? wb.items : [],
        contractors: use.budget ? contractors : [],
        cables: use.cables && wb.cableTabs[cableTab] ? wb.cableTabs[cableTab].rows : null,
        ports: use.ports && wb.ports.length ? wb.ports : null,
      };
      if (projectId) {
        const res = await importWorkbookAction(projectId, payload);
        if (!res.ok) return void toast.error(res.error);
        toast("Workbook imported");
        onClose();
      } else {
        const res = await createProjectFromWorkbookAction(name.trim(), payload);
        if (!res.ok) return void toast.error(res.error);
        toast("Project created from the workbook");
        onClose();
        router.push(`/projects/${res.data.id}/budget`);
      }
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        wide
        title={projectId ? "Import a project workbook" : "New project from a workbook"}
        description={projectId ? "Updates this project from the workbook. Anything it imported before is updated, not duplicated, and statuses you've set here are kept." : "An Excel (.xlsx) workbook with tabs for the budget, item lists, cable runs and network. From Google Sheets: File → Download → Microsoft Excel."}
      >
        <div className="grid gap-4">
          <Field label="Workbook" htmlFor="wb-file">
            <Input id="wb-file" type="file" accept=".xlsx" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
          </Field>
          {error && (
            <p role="alert" className="text-[13px] text-bad">
              {error}
            </p>
          )}
          {wb && (
            <>
              {!projectId && (
                <Field label="Project name" htmlFor="wb-name">
                  <Input id="wb-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
                </Field>
              )}
              <fieldset className="grid gap-2" data-testid="workbook-summary">
                <legend className="mb-1.5 text-xs font-[510] text-muted">What to import</legend>
                {wb.budget.length > 0 && (
                  <Part checked={use.budget} onChange={() => toggle("budget")} title={`Budget: ${wb.budget.length} categories, ${dollars(wb.budget.reduce((s, b) => s + b.budget, 0))} in total`}>
                    {sources.map((src) => `${src}: ${wb.budget.filter((b) => b.source === src).map((b) => b.category).join(", ")}`).join(" · ")}
                    {sources.length > 0 && (
                      <span className="mt-1.5 grid gap-1">
                        {sources.map((src) => (
                          <label key={src} className="flex items-center gap-2 text-fg-2">
                            <input
                              type="checkbox"
                              className="size-3.5 accent-[var(--cta)]"
                              checked={contractors.includes(src)}
                              disabled={!use.budget}
                              onChange={() => setContractors(contractors.includes(src) ? contractors.filter((c) => c !== src) : [...contractors, src])}
                            />
                            {src} is a contractor: add them with a quoted scope of work for each of their lines
                          </label>
                        ))}
                      </span>
                    )}
                  </Part>
                )}
                {wb.items.length > 0 && (
                  <Part checked={use.items} onChange={() => toggle("items")} title={`Bill of materials: ${wb.items.length} items, ${dollars(wb.items.reduce((s, i) => s + i.qty * i.unitCost, 0))}`}>
                    {itemTabs.map((t) => `${t.name} (${t.count})`).join(", ")}
                  </Part>
                )}
                {wb.cableTabs.length > 0 && (
                  <Part checked={use.cables} onChange={() => toggle("cables")} title={`Cable schedule: ${wb.cableTabs[cableTab]?.rows.length ?? 0} runs`}>
                    {wb.cableTabs.length > 1 ? (
                      <Select value={cableTab} onChange={(e) => setCableTab(Number(e.target.value))} aria-label="Cable tab" className="mt-1 h-8 w-auto text-[13px]" disabled={!use.cables}>
                        {wb.cableTabs.map((t, i) => (
                          <option key={t.name} value={i}>
                            {t.name} ({t.rows.length})
                          </option>
                        ))}
                      </Select>
                    ) : (
                      `From ${wb.cableTabs[0].name}`
                    )}
                  </Part>
                )}
                {wb.ports.length > 0 && (
                  <Part checked={use.ports} onChange={() => toggle("ports")} title={`Network plan: ${wb.ports.length} ports and devices`}>
                    {switches.join(", ")}. Rename the switches on the Network tab.
                    {dupes.size > 0 && (
                      <span className="mt-1 flex items-center gap-1.5 text-bad">
                        <TriangleAlert className="size-3.5" /> {dupes.size} IP address{dupes.size === 1 ? " is" : "es are"} used by more than one device; the Network tab lists them.
                      </span>
                    )}
                  </Part>
                )}
              </fieldset>
              {wb.tabs.some((t) => t.kind === "skipped") && (
                <p className="text-xs text-faint">
                  Not imported: {wb.tabs.filter((t) => t.kind === "skipped").map((t) => t.name).join(", ")} (not a budget, item list, cable schedule or network plan).
                </p>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!wb || pending || (!projectId && !name.trim()) || !Object.values(use).some(Boolean)} onClick={submit}>
              {pending ? "Importing…" : projectId ? "Import" : "Create project"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Part({ checked, onChange, title, children }: { checked: boolean; onChange: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-[8px] border border-line bg-surface p-3">
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={title} className="mt-0.5 size-4 shrink-0 accent-[var(--cta)]" />
      <div className="min-w-0 text-[13px]">
        <p className="font-[510] text-fg-hi">{title}</p>
        <div className="mt-0.5 text-muted">{children}</div>
      </div>
    </div>
  );
}
