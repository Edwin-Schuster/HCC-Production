"use client";

import { History } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { restoreVersionAction } from "@/app/actions/sops";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** Rolls back by copying an old version into the draft. It goes live only when that draft is published. */
export function RestoreVersionButton({ sopId, versionNumber, hasDraft }: { sopId: string; versionNumber: number; hasDraft: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <History /> Restore
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={`Restore v${versionNumber}?`}
          description={`This copies v${versionNumber} into a draft for you to check and publish. ${hasDraft ? "The current draft will be replaced." : ""} Published versions are never changed.`}
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={hasDraft ? "danger" : "primary"}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await restoreVersionAction(sopId, versionNumber, hasDraft);
                  if (res && !res.ok) toast.error(res.error);
                })
              }
            >
              {hasDraft ? "Replace draft and restore" : `Restore v${versionNumber}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
