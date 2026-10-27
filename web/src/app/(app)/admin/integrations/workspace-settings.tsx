"use client";

import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { calendarFeedAction, saveSettingsAction } from "@/app/actions/integrations";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { WorkspaceSettings } from "@/db/schema";

export function WorkspaceSettingsForm({ settings }: { settings: WorkspaceSettings }) {
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4 rounded-[12px] border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveSettingsAction({ reminderHours: Number(fd.get("reminderHours")), appUrl: String(fd.get("appUrl") ?? ""), ntfyServer: String(fd.get("ntfyServer") ?? "") });
          if (res.ok) toast("Saved");
          else toast.error(res.error);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Task reminders" htmlFor="ws-rem" hint="Hours before 5 pm on the due date that assignees are reminded.">
          <Input id="ws-rem" name="reminderHours" type="number" min={1} max={336} defaultValue={settings.reminderHours ?? 24} />
        </Field>
        <Field label="App address" htmlFor="ws-url" hint="Used for links in calendar feeds and phone notifications.">
          <Input id="ws-url" name="appUrl" type="url" placeholder="https://production.example.org" defaultValue={settings.appUrl ?? ""} />
        </Field>
      </div>
      <Field label="ntfy server" htmlFor="ws-ntfy" hint="Phone notifications go through ntfy. Leave blank to use https://ntfy.sh; everyone picks their own topic on their profile.">
        <Input id="ws-ntfy" name="ntfyServer" type="url" placeholder="https://ntfy.sh" defaultValue={settings.ntfyServer ?? ""} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function CalendarFeed({ path }: { path: string | null }) {
  const [pending, start] = useTransition();
  const act = (enabled: boolean, msg: string) =>
    start(async () => {
      const res = await calendarFeedAction(enabled);
      if (res.ok) toast(msg);
      else toast.error(res.error);
    });
  const url = path ? (typeof window === "undefined" ? path : window.location.origin + path) : null;
  return (
    <div className="grid gap-3 rounded-[12px] border border-line bg-surface p-4 text-[13px]">
      {url ? (
        <>
          <div className="flex items-center gap-2">
            <Input readOnly value={url} aria-label="Calendar feed address" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} suppressHydrationWarning />
            <CopyButton text={url} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => confirm("Give the feed a new address? Calendars subscribed to the old one stop updating.") && act(true, "The feed has a new address")}>
              <RefreshCw /> New address
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Turn the calendar feed off?") && act(false, "Calendar feed turned off")}>
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-muted">The feed is off.</span>
          <Button size="sm" variant="primary" disabled={pending} onClick={() => act(true, "Calendar feed turned on")}>
            Turn on
          </Button>
        </div>
      )}
    </div>
  );
}
