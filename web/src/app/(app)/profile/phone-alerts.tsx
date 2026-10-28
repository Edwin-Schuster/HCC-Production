"use client";

import { BellRing, Shuffle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveTopicAction, testPushAction } from "@/app/actions/push";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/** Phone notifications through the ntfy app: pick a hard-to-guess topic and subscribe to it on your phone. */
export function PhoneAlerts({ topic, server }: { topic: string | null; server: string }) {
  const [value, setValue] = useState(topic ?? "");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      <ol className="list-decimal space-y-1 pl-5 text-[13px] text-fg-2">
        <li>Install the free <b className="font-[510]">ntfy</b> app (iPhone or Android).</li>
        <li>Choose a topic below and save it. Make it hard to guess: anyone who knows it can read your alerts.</li>
        <li>
          In the app, subscribe to that topic{server !== "https://ntfy.sh" && <> on the server <span className="font-mono text-xs">{server}</span></>}, then send a test.
        </li>
      </ol>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await saveTopicAction(value);
            if (res.ok) toast(value ? "Phone alerts are on" : "Phone alerts are off");
            else toast.error(res.error);
          });
        }}
      >
        <Field label="ntfy topic" htmlFor="ntfy-topic" hint="Leave empty to turn phone alerts off.">
          <div className="flex gap-2">
            <Input id="ntfy-topic" value={value} onChange={(e) => setValue(e.target.value)} placeholder="hcc-edwin-4f9k2q" className="font-mono" autoCapitalize="off" autoCorrect="off" />
            <Button type="button" variant="ghost" size="icon" aria-label="Suggest a topic" title="Suggest a topic" onClick={() => setValue(`hcc-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`)}>
              <Shuffle />
            </Button>
          </div>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={pending || value === (topic ?? "")}>
            Save
          </Button>
          <Button
            type="button"
            disabled={pending || !topic}
            onClick={() =>
              start(async () => {
                const res = await testPushAction();
                if (res.ok) toast("Test sent. Check your phone.");
                else toast.error(res.error);
              })
            }
          >
            <BellRing /> Send a test
          </Button>
        </div>
      </form>
    </div>
  );
}
