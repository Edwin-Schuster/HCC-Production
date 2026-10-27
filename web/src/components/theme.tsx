"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const KEY = "hcc-theme";

function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

/** The current theme from <html data-theme>; null while server rendering. */
export function useTheme(): "dark" | "light" | null {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => null,
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const next = theme === "light" ? "dark" : "light";
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(KEY, next);
        } catch {}
      }}
    >
      {theme === "light" ? <Moon /> : <Sun />}
    </Button>
  );
}
