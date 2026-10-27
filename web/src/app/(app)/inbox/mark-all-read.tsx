"use client";

import { CheckCheck } from "lucide-react";
import { useTransition } from "react";
import { markAllReadAction } from "@/app/actions/reviews";
import { Button } from "@/components/ui/button";

export function MarkAllRead() {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" disabled={pending} onClick={() => start(async () => void (await markAllReadAction()))}>
      <CheckCheck /> Mark all read
    </Button>
  );
}
