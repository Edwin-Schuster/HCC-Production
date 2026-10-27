import { Badge } from "@/components/ui/badge";

const LABEL = { draft: "Draft", in_review: "In review", approved: "Approved", published: "Published", retired: "Retired" } as const;
const TONE = { draft: "strong", in_review: "info", approved: "info", published: "good", retired: "bad" } as const;

export function StatusBadge({ status, className }: { status: keyof typeof LABEL; className?: string }) {
  return (
    <Badge tone={TONE[status]} className={className}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {LABEL[status]}
    </Badge>
  );
}

export const STATUS_OPTIONS = Object.entries(LABEL) as [keyof typeof LABEL, string][];
