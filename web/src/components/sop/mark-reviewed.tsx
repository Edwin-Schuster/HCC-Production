"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { markReviewedAction } from "@/app/actions/reviews";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";

/** "Still accurate": restarts the review clock without publishing a new version. */
export function MarkReviewedDialog({ sopId, title, open, onOpenChange }: { sopId: string; title: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Mark as reviewed" description={`Confirms “${title}” is still accurate. The next review date moves forward by its review interval. If something needs changing, edit and publish instead.`}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await markReviewedAction(sopId, note);
              if (!res.ok) return void toast.error(res.error);
              toast("Marked as reviewed");
              setNote("");
              onOpenChange(false);
            });
          }}
        >
          <Field label="Note" htmlFor="review-note" hint="Optional. Saved in the audit log.">
            <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} placeholder="Walked through it with the team on Sunday." />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Mark reviewed"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MarkReviewedButton({ sopId, title, children }: { sopId: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {children}
      </Button>
      <MarkReviewedDialog sopId={sopId} title={title} open={open} onOpenChange={setOpen} />
    </>
  );
}
