"use client";

import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteBudgetLineAction, saveBudgetLineAction } from "@/app/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { formatMoney } from "@/lib/format";
import type { CategoryBudget } from "@/lib/purchasing";
import { cn } from "@/lib/utils";
import type { BudgetLine } from "@/server/services/purchasing";

const money = (c: number) => formatMoney(c, { cents: c % 100 !== 0 });

/**
 * Budget by category: what each category was given, against what's planned (parts list and contractor quotes),
 * committed (orders and signed work) and spent. Categories with a budget line come first, grouped by who pays.
 */
export function BudgetByCategory({ projectId, rows, lines }: { projectId: string; rows: CategoryBudget[]; lines: BudgetLine[] }) {
  const [editing, setEditing] = useState<BudgetLine | { category: string } | null>(null);
  const lineOf = new Map(lines.map((l) => [l.category.toLowerCase(), l]));
  const sum = (k: "planned" | "committed" | "spent") => rows.reduce((s, r) => s + r[k], 0);
  const budgeted = rows.reduce((s, r) => s + (r.budgeted ?? 0), 0);
  // A "paid by" heading goes above the first budgeted row of each payer.
  const headers = rows.map((r, i) => (r.budgeted !== null && r.source && rows.slice(0, i).every((p) => p.budgeted === null || p.source !== r.source) ? r.source : null));
  return (
    <section aria-labelledby="cat-h">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="cat-h" className="text-[15px] font-[510]">
          Budget by category
        </h2>
        <Button size="sm" onClick={() => setEditing({ category: "" })}>
          <Plus /> Budget line
        </Button>
      </div>
      {!rows.length ? (
        <p className="rounded-[12px] border border-dashed border-line px-6 py-8 text-center text-[13px] text-muted">Give each category a budget, like Lighting or Video, to see what's left in each as you plan and buy.</p>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-line bg-surface">
          <table className="w-full min-w-[680px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-3 py-2 font-normal">Category</th>
                <th className="px-3 py-2 text-right font-normal">Budget</th>
                <th className="px-3 py-2 text-right font-normal">Planned</th>
                <th className="px-3 py-2 text-right font-normal">Committed</th>
                <th className="px-3 py-2 text-right font-normal">Spent</th>
                <th className="px-3 py-2 text-right font-normal">Left to plan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const header = headers[i];
                const left = r.budgeted !== null ? r.budgeted - Math.max(r.planned, r.committed) : null;
                const line = lineOf.get(r.category.toLowerCase());
                return [
                  header ? (
                    <tr key={`h-${header}`} className="border-b border-line bg-wash-2">
                      <th colSpan={6} scope="rowgroup" className="px-3 py-1.5 text-left text-xs font-[510] text-fg-2">
                        {header}
                      </th>
                    </tr>
                  ) : null,
                  <tr key={r.category} className="cursor-pointer border-b border-line last:border-0 hover:bg-wash-2" onClick={() => setEditing(line ?? { category: r.category })}>
                    <td className="px-3 py-2 text-fg-hi">
                      <button type="button" className="text-left" onClick={() => setEditing(line ?? { category: r.category })}>
                        {r.category}
                      </button>
                      {r.budgeted === null && (
                        <Badge tone="neutral" className="ml-2">
                          No budget
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{r.budgeted !== null ? money(r.budgeted) : "—"}</td>
                    <td className={cn("px-3 py-2 text-right font-mono text-xs", r.budgeted !== null && r.planned > r.budgeted && "text-bad")}>{money(r.planned)}</td>
                    <td className={cn("px-3 py-2 text-right font-mono text-xs", r.budgeted !== null && r.committed > r.budgeted && "text-bad")}>{money(r.committed)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{money(r.spent)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {left === null ? (
                        ""
                      ) : left < 0 ? (
                        <span className="inline-flex items-center gap-1 text-bad">
                          <TriangleAlert className="size-3" aria-hidden /> {money(-left)} over
                        </span>
                      ) : (
                        <span className="text-good">{money(left)}</span>
                      )}
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line font-mono text-xs text-fg-hi">
                <td className="px-3 py-2 font-sans text-[13px] font-[510]">Total</td>
                <td className="px-3 py-2 text-right">{money(budgeted)}</td>
                <td className="px-3 py-2 text-right">{money(sum("planned"))}</td>
                <td className="px-3 py-2 text-right">{money(sum("committed"))}</td>
                <td className="px-3 py-2 text-right">{money(sum("spent"))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {editing && <LineDialog projectId={projectId} line={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function LineDialog({ projectId, line, onClose }: { projectId: string; line: BudgetLine | { category: string }; onClose: () => void }) {
  const [pending, start] = useTransition();
  const current = "id" in line ? line : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={current ? `${current.category} budget` : line.category ? `Budget for ${line.category}` : "Add a budget line"}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const s = (k: string) => String(fd.get(k) ?? "");
            start(async () => {
              const res = await saveBudgetLineAction(projectId, { category: s("category"), source: s("source"), budget: Number(s("budget") || 0), notes: s("notes") }, current?.id);
              if (!res.ok) return void toast.error(res.error);
              toast("Budget saved");
              onClose();
            });
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category" htmlFor="bl-cat">
              <Input id="bl-cat" name="category" defaultValue={line.category} required autoFocus={!line.category} placeholder="Lighting" />
            </Field>
            <Field label="Budget ($)" htmlFor="bl-budget">
              <Input id="bl-budget" name="budget" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={current ? current.budgetCents / 100 : ""} autoFocus={!!line.category} />
            </Field>
          </div>
          <Field label="Paid by" htmlFor="bl-source" hint="Groups the lines, like the contractor's contract versus your own purchases.">
            <Input id="bl-source" name="source" defaultValue={current?.source} placeholder="HCC" />
          </Field>
          <Field label="Notes" htmlFor="bl-notes">
            <Textarea id="bl-notes" name="notes" defaultValue={current?.notes} rows={2} />
          </Field>
          <p className="text-xs text-faint">The project budget is the total of its budget lines.</p>
          <div className="flex items-center gap-2">
            {current && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove the ${current.category} budget line? Its items and orders stay.`)) return;
                  start(async () => {
                    const res = await deleteBudgetLineAction(current.id);
                    if (res.ok) onClose();
                    else toast.error(res.error);
                  });
                }}
              >
                <Trash2 /> Remove
              </Button>
            )}
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
