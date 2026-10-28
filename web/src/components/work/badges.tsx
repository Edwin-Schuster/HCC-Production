import { Badge } from "@/components/ui/badge";
import { PERSON_STATUS_TONE, type PersonStatus } from "@/lib/roster";
import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL, TASK_STATUS_LABEL, labelHue, type Priority, type ProjectStatus, type TaskStatus } from "@/lib/work";

const PROJECT_TONE = { planning: "neutral", active: "info", on_hold: "warn", complete: "good" } as const;
const TASK_TONE = { backlog: "neutral", todo: "strong", in_progress: "info", blocked: "bad", review: "warn", done: "good" } as const;
const PRIORITY_TONE = { urgent: "bad", high: "warn", medium: "neutral", low: "neutral" } as const;

export const ProjectStatusBadge = ({ status }: { status: ProjectStatus }) => <Badge tone={PROJECT_TONE[status]}>{PROJECT_STATUS_LABEL[status]}</Badge>;
export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => <Badge tone={TASK_TONE[status]}>{TASK_STATUS_LABEL[status]}</Badge>;
export const PriorityBadge = ({ priority }: { priority: Priority }) => <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;

export function LabelChip({ label }: { label: string }) {
  const h = labelHue(label);
  return (
    <span className="inline-flex items-center rounded-full px-1.5 text-[11px] leading-[17px]" style={{ background: `hsl(${h} 45% 50% / 0.16)`, color: `color-mix(in oklab, hsl(${h} 60% 50%) 65%, var(--color-fg-hi))` }}>
      {label}
    </span>
  );
}

/** Bar showing how far along something is. */
export function Meter({ pct, tone = "fg" }: { pct: number; tone?: "fg" | "bad" }) {
  return (
    <span className="block h-1 overflow-hidden rounded-full bg-wash" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span className={tone === "bad" ? "block h-full bg-bad" : "block h-full bg-fg-2"} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );
}

export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export function Avatar({ name, size = "sm" }: { name: string; size?: "xs" | "sm" | "md" }) {
  const cls = size === "xs" ? "size-5 text-[9px]" : size === "sm" ? "size-6 text-[10px]" : "size-8 text-[11px]";
  return (
    <span title={name} className={`grid ${cls} shrink-0 place-items-center rounded-full bg-surface-3 font-[510] text-fg-2 ring-2 ring-surface`}>
      {initials(name)}
    </span>
  );
}

const DOT = { good: "bg-good", info: "bg-iris", warn: "bg-warn", bad: "bg-bad" } as const;
export function StatusDot({ status }: { status: PersonStatus }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[PERSON_STATUS_TONE[status]])} />;
}
