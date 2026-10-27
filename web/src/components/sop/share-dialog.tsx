"use client";

import { Ban, Link2, Lock } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createShareLinkAction, listShareLinksAction, revokeShareLinkAction } from "@/app/actions/shares";
import type { ShareLinkView } from "@/server/services/shares";
import { CopyButton } from "@/components/copy-button";
import { LocalDate } from "@/components/local-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";

/** Create and manage links that open this SOP without signing in. */
export function ShareDialog({ sopId, open, onOpenChange }: { sopId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [links, setLinks] = useState<ShareLinkView[] | null>(null);
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [expires, setExpires] = useState("");
  const [pin, setPin] = useState(false);
  const [pending, start] = useTransition();
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = () =>
    start(async () => {
      const res = await listShareLinksAction(sopId);
      if (res.ok) setLinks(res.data);
      else toast.error(res.error);
    });
  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload each time it opens
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title="Share outside the team" description="Anyone with the link can read the published SOP, without signing in. Drafts are never shared. Turn a link off at any time.">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await createShareLinkAction(sopId, { label, password, expiresInDays: expires ? Number(expires) : null, pinVersion: pin });
              if (!res.ok) return void toast.error(res.error);
              await navigator.clipboard?.writeText(`${origin}/s/${res.data.token}`).catch(() => {});
              toast("Link created and copied");
              setLabel("");
              setPassword("");
              load();
            });
          }}
        >
          <Field label="Label" htmlFor="share-label" hint="Who it's for, e.g. “Guest audio engineer”.">
            <Input id="share-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Password" htmlFor="share-pass" hint="Optional. At least 6 characters.">
            <Input id="share-pass" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Expires" htmlFor="share-exp">
            <Select id="share-exp" value={expires} onChange={(e) => setExpires(e.target.value)}>
              <option value="">Never</option>
              <option value="1">In 1 day</option>
              <option value="7">In 7 days</option>
              <option value="30">In 30 days</option>
              <option value="90">In 90 days</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-fg-2">
            <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> Keep showing this version, even after updates
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" disabled={pending}>
              <Link2 /> Create link
            </Button>
          </div>
        </form>

        <div className="mt-6 grid gap-2">
          {links?.length === 0 && <p className="text-[13px] text-muted">No links yet.</p>}
          {links?.map((l) => {
            const dead = Boolean(l.revokedAt) || l.expired;
            const url = `${origin}/s/${l.token}`;
            return (
              <div key={l.id} className="rounded-[8px] border border-line px-3 py-2.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-[510] text-fg-hi">{l.label || "Untitled link"}</span>
                  {l.hasPassword && (
                    <Badge>
                      <Lock className="size-3" /> Password
                    </Badge>
                  )}
                  {l.versionNumber && <Badge>v{l.versionNumber} only</Badge>}
                  {l.revokedAt ? <Badge tone="bad">Off</Badge> : dead ? <Badge tone="warn">Expired</Badge> : null}
                  <span className="flex-1" />
                  {!dead && <CopyButton text={url} />}
                  {!l.revokedAt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await revokeShareLinkAction(l.id);
                          if (!res.ok) return void toast.error(res.error);
                          load();
                        })
                      }
                    >
                      <Ban /> Turn off
                    </Button>
                  )}
                </div>
                {!dead && <p className="mt-1 truncate font-mono text-xs text-muted">{url}</p>}
                <p className="mt-1 text-xs text-faint">
                  {l.viewCount} view{l.viewCount === 1 ? "" : "s"}
                  {l.expiresAt && (
                    <>
                      {" "}· expires <LocalDate iso={l.expiresAt} />
                    </>
                  )}{" "}
                  · created by {l.createdByName ?? "someone"} <LocalDate iso={l.createdAt} />
                </p>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
