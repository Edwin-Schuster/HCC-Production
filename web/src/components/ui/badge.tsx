import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-[4px] px-1.5 text-xs leading-[18px]", {
  variants: {
    tone: {
      neutral: "bg-wash text-muted",
      strong: "bg-wash text-fg-2",
      good: "bg-good-soft text-good",
      info: "bg-info-soft text-iris-text",
      warn: "bg-warn-soft text-warn",
      bad: "bg-bad-soft text-bad",
      outline: "border border-line text-fg-2",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
