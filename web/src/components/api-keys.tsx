"use client";

import { Ban, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createApiKeyAction, revokeApiKeyAction } from "@/app/actions/integrations";
import type { ApiKeyView } from "@/server/services/apikeys";
import { CopyButton } from "@/components/copy-button";
import { LocalDate } from "@/components/local-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export function ApiKeys({ keys, canEdit, showOwner }: { keys: ApiKeyView[]; canEdit: boolean; showOwner?: boolean }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [created, setCreated] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createApiKeyAction({ name, role });
            if (!res.ok) return void toast.error(res.error);
            setCreated(res.data.token);
            setName("");
          });
        }}
      >
        <Field label="New key" htmlFor="key-name" className="min-w-56 flex-1">
          <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Browser extension" maxLength={80} required />
        </Field>
        <Field label="Can" htmlFor="key-role">
          <Select id="key-role" value={role} onChange={(e) => setRole(e.target.value as "viewer" | "editor")}>
            <option value="viewer">Read SOPs</option>
            {canEdit && <option value="editor">Read and write SOPs</option>}
          </Select>
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          <KeyRound /> Create key
        </Button>
      </form>
      {created && (
        <div className="rounded-[8px] border border-warn/40 bg-warn-soft px-3 py-2.5 text-[13px]" role="status">
          <p className="text-fg-hi">Copy this key now. It won't be shown again.</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[4px] bg-bg px-2 py-1 font-mono text-xs">{created}</code>
            <CopyButton text={created} />
          </div>
        </div>
      )}
      {keys.length > 0 && (
        <ul role="list" className="divide-y divide-line overflow-hidden rounded-[12px] border border-line">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13.5px]">
              <span className="min-w-0 flex-1">
                <span className="text-fg-hi">{k.name}</span> <span className="font-mono text-xs text-muted">{k.prefix}…</span>
                <span className="block text-xs text-faint">
                  {showOwner && `${k.ownerName} · `}created <LocalDate iso={k.createdAt} /> · {k.lastUsedAt ? <>last used <LocalDate iso={k.lastUsedAt} withTime /></> : "never used"}
                </span>
              </span>
              <Badge>{k.role === "editor" ? "read & write" : "read"}</Badge>
              {k.revoked ? (
                <Badge tone="bad">Revoked</Badge>
              ) : (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => void (await revokeApiKeyAction(k.id)))}>
                  <Ban /> Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
