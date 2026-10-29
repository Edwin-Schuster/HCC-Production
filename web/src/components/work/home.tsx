"use client";

import { useNow } from "@/components/local-date";

/** "Good morning, Edwin" in the reader's own time of day. */
export function Greeting({ name }: { name: string }) {
  const now = useNow();
  const first = name.split(/\s+/)[0];
  if (now === null) return <>Hello, {first}</>;
  const h = new Date(now).getHours();
  return (
    <>
      {h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, {first}
    </>
  );
}
