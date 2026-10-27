"use client";

import { Play } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { startRunAction } from "@/app/actions/runs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";

/** Starts a run of the current version, with an optional label like "9:00 service". */
export function StartRunButton({ sopId, compact }: { sopId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Play /> {compact ? <span className="hidden sm:inline">Run</span> : "Start a run"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Start a run" description="Work through this SOP as a checklist. Ticks, who did them, times and notes are saved. Teammates can help tick off steps.">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await startRunAction(sopId, label);
                if (res && !res.ok) toast.error(res.error);
              });
            }}
          >
            <Field label="Label" htmlFor="run-label" hint="Optional, e.g. “9:00 service” or “Easter rehearsal”.">
              <Input id="run-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} autoFocus />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                <Play /> {pending ? "Starting…" : "Start"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
