"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const KEY = "hcc-theme";

/** Applies the saved theme before first paint (see Next's "preventing flash" guide). */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}` }} />;
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => setTheme((document.documentElement.dataset.theme as "dark" | "light") ?? "dark"), []);
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
        setTheme(next);
      }}
    >
      {theme === "light" ? <Moon /> : <Sun />}
    </Button>
  );
}
