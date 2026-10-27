import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { getAnalytics, type Analytics } from "@/server/services/analytics";
import { Empty, Page, PageHeader } from "@/components/page";
import { cn } from "@/lib/utils";
import { formatMinutes } from "@/blocks/tree";

export const metadata: Metadata = { title: "Analytics" };

const RANGES = [7, 30, 90, 365] as const;

export default function AnalyticsPage(props: PageProps<"/analytics">) {
  return (
    <Page wide>
      <PageHeader title="Analytics" subtitle="Which SOPs get read, which steps people skip, how long runs take, and where readers report problems." />
      <Suspense fallback={<div className="h-96" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/analytics">["searchParams"] }) {
  const actor = await requireRole("editor", "/analytics");
  const sp = await searchParams;
  const days = RANGES.find((r) => String(r) === sp.days) ?? 30;
  const a = await getAnalytics(await getDb(), actor, days);
  return (
    <div className="grid gap-8">
      <nav className="flex gap-1" aria-label="Time range">
        {RANGES.map((r) => (
          <Link key={r} href={`/analytics?days=${r}`} aria-current={r === days ? "page" : undefined} className={cn("rounded-[6px] px-2.5 py-1 text-[13px]", r === days ? "bg-wash text-fg-hi" : "text-muted hover:text-fg-hi")}>
            {r === 365 ? "12 months" : `${r} days`}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Reads" value={a.totals.views} />
        <Stat label="People reading" value={a.totals.readers} />
        <Stat label="Runs completed" value={a.totals.runsCompleted} />
        <Stat label="Open feedback" value={a.totals.openFeedback} href={a.totals.openFeedback ? "/inbox" : undefined} />
      </div>

      <Section title="Reads per day">
        <DailyChart daily={a.daily} />
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Most-read SOPs">
          {a.topSops.length ? <BarList rows={a.topSops.map((s) => ({ key: s.id, href: `/sops/${s.id}`, label: s.title, sub: s.documentCode, value: s.views, note: `${s.readers} ${s.readers === 1 ? "person" : "people"}` }))} /> : <Empty title="No reads yet" />}
        </Section>
        <Section title="Most-skipped steps" hint="Steps left unticked in completed runs. Often a sign the step is out of date or unnecessary.">
          {a.skipped.length ? (
            <Table
              head={["Step", "Skipped", "Of runs"]}
              rows={a.skipped.map((s) => [
                <Link key="l" href={`/sops/${s.sopId}`} className="hover:underline">
                  <span className="block text-fg-hi">{s.label}</span>
                  <span className="text-xs text-muted">{s.sopTitle}</span>
                </Link>,
                s.skipped,
                s.runs,
              ])}
            />
          ) : (
            <Empty title="No skipped steps" />
          )}
        </Section>
        <Section title="Run times" hint="Average time for completed runs, against the steps' own estimates.">
          {a.runTimes.length ? (
            <Table
              head={["SOP", "Runs", "Average", "Estimate"]}
              rows={a.runTimes.map((r) => [
                <Link key="l" href={`/sops/${r.sopId}/runs`} className="text-fg-hi hover:underline">
                  {r.sopTitle}
                </Link>,
                r.runs,
                formatMinutes(r.avgMinutes) || "< 1 min",
                r.estimatedMinutes ? formatMinutes(r.estimatedMinutes) : "—",
              ])}
            />
          ) : (
            <Empty title="No completed runs" />
          )}
        </Section>
        <Section title="Feedback by SOP">
          {a.feedback.length ? (
            <Table
              head={["SOP", "Unclear", "Wrong", "Other", "Open"]}
              rows={a.feedback.map((f) => [
                <Link key="l" href={`/sops/${f.sopId}/feedback`} className="text-fg-hi hover:underline">
                  {f.sopTitle}
                </Link>,
                f.unclear,
                f.wrong,
                f.other,
                f.open,
              ])}
            />
          ) : (
            <Empty title="No feedback in this period" />
          )}
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <span className="block text-xs text-muted">{label}</span>
      <span className="mt-1 block font-mono text-[26px] leading-none text-fg-hi tabular-nums">{value.toLocaleString()}</span>
    </>
  );
  return href ? (
    <Link href={href} className="rounded-[12px] border border-line bg-surface px-4 py-3 hover:border-line-2">
      {body}
    </Link>
  ) : (
    <div className="rounded-[12px] border border-line bg-surface px-4 py-3">{body}</div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="text-[14px] font-[510] text-fg-hi">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One series, so no legend: the section title names it. Each column shows its value on hover or focus. */
function DailyChart({ daily }: { daily: Analytics["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.views));
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <figure className="rounded-[12px] border border-line bg-surface px-4 pb-3 pt-4">
      <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={`Reads per day, highest ${max}`}>
        {daily.map((d) => (
          <div key={d.day} tabIndex={0} className="group relative flex h-full min-w-0 flex-1 items-end outline-none">
            <div className="w-full rounded-t-[4px] bg-fg-2/70 transition-colors group-hover:bg-fg-hi group-focus:bg-fg-hi" style={{ height: `${(d.views / max) * 100}%`, minHeight: d.views ? 2 : 0 }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-[6px] border border-line-2 bg-surface-3 px-2 py-1 text-xs text-fg-hi shadow-lg group-hover:block group-focus:block">
              {fmt(d.day)} · <span className="font-mono">{d.views}</span>
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between border-t border-line pt-1.5 text-[11px] text-faint">
        <span>{fmt(daily[0].day)}</span>
        <span>max {max}</span>
        <span>{fmt(daily[daily.length - 1].day)}</span>
      </figcaption>
      <table className="sr-only">
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function BarList({ rows }: { rows: { key: string; href: string; label: string; sub: string; value: number; note: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="grid gap-2" role="list">
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={r.href} className="group block">
            <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className="min-w-0 truncate text-fg-hi group-hover:underline">{r.label}</span>
              <span className="shrink-0 font-mono text-xs text-fg-2">{r.value.toLocaleString()}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-wash">
                <div className="h-full rounded-full bg-fg-2/70" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right text-[11px] text-faint">{r.note}</span>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-line">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="bg-surface text-left text-xs text-muted">
            {head.map((h, i) => (
              <th key={h} className={cn("px-3 py-2 font-[510]", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => (
                <td key={j} className={cn("px-3 py-2 align-top", j > 0 && "text-right font-mono text-fg-2")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
