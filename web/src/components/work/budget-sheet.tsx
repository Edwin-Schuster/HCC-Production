"use client";

import { ExternalLink, Sheet, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setBudgetSheetAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/** The project's Google Sheet, editable in place (Google asks people to sign in to edit). */
export function BudgetSheet({ projectId, url }: { projectId: string; url: string | null }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  const save = (next: string | null) =>
    start(async () => {
      const res = await setBudgetSheetAction(projectId, next);
      if (!res.ok) return void toast.error(res.error);
      toast(next ? "Spreadsheet linked" : "Spreadsheet removed");
      setEditing(false);
    });

  const form = (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save(String(new FormData(e.currentTarget).get("sheet") ?? ""));
      }}
    >
      <Input name="sheet" type="url" required placeholder="https://docs.google.com/spreadsheets/d/…" defaultValue={url ?? ""} aria-label="Google Sheets link" className="min-w-[260px] flex-1" autoFocus={editing} />
      <Button type="submit" variant="primary" disabled={pending}>
        {url ? "Save" : "Link spreadsheet"}
      </Button>
      {editing && (
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      )}
    </form>
  );

  return (
    <section aria-labelledby="sheet-h" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="sheet-h" className="mr-auto flex items-center gap-2 text-[15px] font-[510]">
          <Sheet className="size-4 text-muted" aria-hidden /> Budget spreadsheet
        </h2>
        {url && !editing && (
          <>
            <Button asChild size="sm">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Open in Google Sheets
              </a>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Change
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              aria-label="Remove spreadsheet"
              onClick={() => confirm("Remove the spreadsheet from this project? The sheet itself isn't changed.") && save(null)}
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>
      {!url || editing ? (
        <div className="rounded-[12px] border border-dashed border-line-2 bg-surface p-4">
          {!url && <p className="mb-3 text-[13px] text-muted">Paste a Google Sheets link to keep the project&apos;s spreadsheet here, where anyone with access to the sheet can edit it.</p>}
          {form}
        </div>
      ) : (
        <>
          <iframe
            title="Budget spreadsheet"
            src={url}
            className="h-[75vh] min-h-[480px] w-full rounded-[12px] border border-line bg-white"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
          <p className="text-xs text-muted">
            Edits save to Google Sheets. To edit here, sign in to Google in this browser with an account that can edit the sheet. If it asks you to sign in and nothing happens (some browsers block this), use Open in Google Sheets.
          </p>
        </>
      )}
    </section>
  );
}
