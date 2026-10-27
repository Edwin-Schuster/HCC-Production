import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] border text-[13px] tracking-[-0.01em] transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "border-cta bg-cta font-[510] text-cta-ink shadow-[0_1px_1px_rgb(0_0_0/0.07),0_3px_2px_rgb(0_0_0/0.04)] hover:border-cta-hover hover:bg-cta-hover",
        secondary: "border-line bg-transparent text-fg-2 hover:border-line-2 hover:bg-wash hover:text-fg-hi",
        ghost: "border-transparent bg-transparent text-fg-2 hover:bg-wash hover:text-fg-hi",
        danger: "border-bad/40 bg-bad-soft text-bad hover:bg-bad/20",
        link: "h-auto border-0 p-0 text-fg-hi underline decoration-line-2 underline-offset-2 hover:decoration-fg-2",
      },
      size: {
        xs: "h-6 px-2 text-xs",
        sm: "h-7 px-2.5 text-[12.5px]",
        md: "h-8 px-3",
        lg: "h-10 px-4 text-sm",
        icon: "size-8 [&_svg]:size-4",
        "icon-sm": "size-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export function Button({ className, variant, size, asChild, ...props }: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
