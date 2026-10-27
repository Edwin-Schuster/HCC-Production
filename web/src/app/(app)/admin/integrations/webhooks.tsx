"use client";

import { Send, Trash2, Webhook } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createWebhookAction, deleteWebhookAction, testWebhookAction } from "@/app/actions/integrations";
import { CopyButton } from "@/components/copy-button";
import { LocalDate } from "@/components/local-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

type Hook = {
  id: string;
  url: string;
  events: string[];
  secret: string;
  deliveries: { id: string; event: string; status: "pending" | "success" | "failed"; attempts: number; lastStatusCode: number | null; lastError: string | null; createdAt: string }[];
};

export function Webhooks({ hooks, events }: { hooks: Hook[]; events: readonly string[] }) {
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>(["sop.published"]);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createWebhookAction({ url, events: picked as never });
            if (!res.ok) return void toast.error(res.error);
            setUrl("");
            toast("Webhook added");
          });
        }}
      >
        <Field label="Send events to" htmlFor="hook-url">
          <Input id="hook-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.org/hooks/hcc" required />
        </Field>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-fg-2">
          <legend className="sr-only">Events</legend>
          {events.map((ev) => (
            <label key={ev} className="flex items-center gap-1.5 font-mono text-xs">
              <input type="checkbox" checked={picked.includes(ev)} onChange={(e) => setPicked(e.target.checked ? [...picked, ev] : picked.filter((x) => x !== ev))} />
              {ev}
            </label>
          ))}
        </fieldset>
        <div>
          <Button type="submit" variant="primary" disabled={pending || !picked.length}>
            <Webhook /> Add webhook
          </Button>
        </div>
      </form>
      {hooks.map((h) => (
        <div key={h.id} className="rounded-[12px] border border-line bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg-hi">{h.url}</span>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => void toast((await testWebhookAction(h.id)).ok ? "Test sent" : "Couldn't send"))}>
              <Send /> Send test
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Remove this webhook?") && start(async () => void (await deleteWebhookAction(h.id)))}>
              <Trash2 /> Remove
            </Button>
          </div>
          <p className="mt-1 font-mono text-xs text-muted">{h.events.join(" · ")}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            Signing secret <code className="rounded-[4px] bg-bg px-1.5 py-0.5 font-mono">{h.secret.slice(0, 12)}…</code>
            <CopyButton text={h.secret} />
          </div>
          {h.deliveries.length > 0 && (
            <ul className="mt-3 grid gap-1 border-t border-line pt-2 text-xs" role="list">
              {h.deliveries.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <Badge tone={d.status === "success" ? "good" : d.status === "failed" ? "bad" : "neutral"}>{d.status}</Badge>
                  <span className="font-mono text-fg-2">{d.event}</span>
                  <span className="text-faint">
                    <LocalDate iso={d.createdAt} withTime />
                    {d.attempts > 1 && ` · ${d.attempts} tries`}
                    {d.lastStatusCode ? ` · HTTP ${d.lastStatusCode}` : ""}
                    {d.lastError && d.status !== "success" ? ` · ${d.lastError}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
