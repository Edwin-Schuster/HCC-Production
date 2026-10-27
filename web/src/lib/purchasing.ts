/** Purchasing vocabulary and the budget arithmetic, shared by the server and the browser. All money is in cents. */

export const BUDGET_CATEGORIES = ["Audio", "Video", "Lighting", "Network", "Cabling", "Labor", "Furniture", "Software", "Other"] as const;

export const BOM_STATUSES = ["needed", "quoted", "ordered", "received", "installed"] as const;
export type BomStatus = (typeof BOM_STATUSES)[number];
export const BOM_STATUS_LABEL: Record<BomStatus, string> = { needed: "Needed", quoted: "Quoted", ordered: "Ordered", received: "Received", installed: "Installed" };

export const PO_STATUSES = ["draft", "submitted", "approved", "ordered", "partially_received", "received", "cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];
export const PO_STATUS_LABEL: Record<PoStatus, string> = { draft: "Draft", submitted: "Submitted", approved: "Approved", ordered: "Ordered", partially_received: "Partially received", received: "Received", cancelled: "Cancelled" };

export const INVOICE_STATUSES = ["received", "approved", "paid", "disputed"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { received: "Received", approved: "Approved", paid: "Paid", disputed: "Disputed" };

export const SOW_STATUSES = ["draft", "sent", "signed", "in_progress", "complete"] as const;
export type SowStatus = (typeof SOW_STATUSES)[number];
export const SOW_STATUS_LABEL: Record<SowStatus, string> = { draft: "Draft", sent: "Sent", signed: "Signed", in_progress: "In progress", complete: "Complete" };

type Line = { qty: number; unitCostCents: number; receivedQty: number };
export const lineTotal = (lines: Line[]) => Math.round(lines.reduce((s, l) => s + l.qty * l.unitCostCents, 0));
export const lineReceived = (lines: Line[]) => Math.round(lines.reduce((s, l) => s + Math.min(l.receivedQty, l.qty) * l.unitCostCents, 0));

/** A PO that has been ordered moves to partially received / received as its lines arrive. */
export function deriveStatus(status: PoStatus, lines: Line[]): PoStatus {
  if (!["ordered", "partially_received", "received"].includes(status) || !lines.length) return status;
  if (lines.every((l) => l.receivedQty >= l.qty)) return "received";
  return lines.some((l) => l.receivedQty > 0) ? "partially_received" : "ordered";
}

/** Everything but drafts and cancelled orders counts as committed. */
const COMMITTED_PO: PoStatus[] = ["submitted", "approved", "ordered", "partially_received", "received"];
const COMMITTED_SOW: SowStatus[] = ["signed", "in_progress", "complete"];

export type BudgetInput = {
  budgetCents: number;
  bom: { category: string; qty: number; unitCostCents: number }[];
  pos: { category: string; status: PoStatus; lines: Line[] }[];
  sows: { status: SowStatus; valueCents: number }[];
  invoices: { status: InvoiceStatus; amountCents: number }[];
};
export type Money = { planned: number; committed: number; spent: number };

/**
 * Planned = the bill of materials. Committed = submitted purchase orders plus signed scopes of work.
 * Spent = goods received plus paid invoices. Remaining = budget minus committed. Contractor work counts as Labor.
 */
export function budgetFor(b: BudgetInput) {
  const cats = new Map<string, Money>();
  const cat = (k: string) => {
    const key = k || "Other";
    if (!cats.has(key)) cats.set(key, { planned: 0, committed: 0, spent: 0 });
    return cats.get(key)!;
  };
  for (const x of b.bom) cat(x.category).planned += Math.round(x.qty * x.unitCostCents);
  for (const po of b.pos) {
    if (!COMMITTED_PO.includes(po.status)) continue;
    cat(po.category).committed += lineTotal(po.lines);
    cat(po.category).spent += lineReceived(po.lines);
  }
  for (const s of b.sows) if (COMMITTED_SOW.includes(s.status)) cat("Labor").committed += s.valueCents;
  for (const i of b.invoices) if (i.status === "paid") cat("Labor").spent += i.amountCents;
  const sum = (k: keyof Money) => [...cats.values()].reduce((s, m) => s + m[k], 0);
  const committed = sum("committed");
  return {
    budget: b.budgetCents,
    planned: sum("planned"),
    committed,
    spent: sum("spent"),
    remaining: b.budgetCents - committed,
    byCategory: [...cats].map(([category, m]) => ({ category, ...m })).sort((a, b) => b.planned + b.committed - (a.planned + a.committed)),
  };
}
