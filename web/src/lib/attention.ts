import { duplicateIps } from "./network";
import type { CategoryBudget } from "./purchasing";

/**
 * What on a project needs someone's attention, most serious first. Pure, so it's easy to test: the overview
 * page passes in what it has already loaded.
 */
export type Attention = { tone: "bad" | "warn" | "info"; text: string; href: string };

type Input = {
  base: string;
  categories: CategoryBudget[];
  bom: { status: string; qty: number; unitCostCents: number }[];
  scopes: { company: string; status: string; valueCents: number }[];
  contractors: { company: string; insuranceExpires: string | null }[];
  ports: { id: string; switchName: string; port: string; vlan: string; ip: string; device: string }[];
  cables: { status: string }[];
  today: string;
};

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: c % 100 ? 2 : 0 });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function projectAttention(p: Input): Attention[] {
  const out: Attention[] = [];
  for (const c of p.categories) {
    if (c.budgeted === null) continue;
    const used = Math.max(c.planned, c.committed);
    if (used > c.budgeted && c.budgeted > 0) out.push({ tone: "bad", text: `${c.category} is ${usd(used - c.budgeted)} over its ${usd(c.budgeted)} budget`, href: `${p.base}/budget` });
  }
  const dupes = duplicateIps(p.ports);
  if (dupes.size) out.push({ tone: "bad", text: `${plural(dupes.size, "IP address", "IP addresses")} used by more than one device (${[...dupes.keys()].slice(0, 3).join(", ")}${dupes.size > 3 ? ", …" : ""})`, href: `${p.base}/network` });
  const unbudgeted = p.categories.filter((c) => c.budgeted === null && c.planned > 0);
  for (const c of unbudgeted) out.push({ tone: "warn", text: `${c.category} has ${usd(c.planned)} planned but no budget line`, href: `${p.base}/budget` });
  const unsigned = new Map<string, { n: number; cents: number }>();
  for (const s of p.scopes) if (s.status === "draft" || s.status === "sent") unsigned.set(s.company, { n: (unsigned.get(s.company)?.n ?? 0) + 1, cents: (unsigned.get(s.company)?.cents ?? 0) + s.valueCents });
  for (const [company, u] of unsigned) out.push({ tone: "warn", text: `${company}: ${plural(u.n, "scope")} of work not signed yet (${usd(u.cents)})`, href: `${p.base}/contractors` });
  for (const c of p.contractors) {
    if (!c.insuranceExpires) out.push({ tone: "warn", text: `${c.company} has no insurance certificate on file`, href: `${p.base}/contractors` });
    else if (c.insuranceExpires < p.today) out.push({ tone: "bad", text: `${c.company}'s insurance expired`, href: `${p.base}/contractors` });
  }
  const toBuy = p.bom.filter((b) => b.status === "needed" || b.status === "quoted");
  if (toBuy.length) out.push({ tone: "info", text: `${plural(toBuy.length, "item")} still to order (${usd(toBuy.reduce((s, b) => s + Math.round(b.qty * b.unitCostCents), 0))})`, href: `${p.base}/budget` });
  const unpriced = p.bom.filter((b) => !b.unitCostCents).length;
  if (unpriced) out.push({ tone: "warn", text: `${plural(unpriced, "item")} with no price`, href: `${p.base}/budget` });
  const toPull = p.cables.filter((c) => c.status === "planned").length;
  if (toPull) out.push({ tone: "info", text: `${plural(toPull, "cable")} not pulled yet`, href: `${p.base}/cabling` });
  const rank = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
