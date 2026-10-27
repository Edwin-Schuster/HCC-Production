"use client";

import { UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { upsertMemberAction } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";

type Member = { id: string; username: string; name: string; email: string | null; role: "admin" | "editor" | "viewer"; hasPassword: boolean };

export function PeopleManager({ members, selfId }: { members: Member[]; selfId: string }) {
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [pending, start] = useTransition();
  const current = editing === "new" ? null : editing;
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" onClick={() => setEditing("new")}>
          <UserPlus /> Add person
        </Button>
      </div>
      <ul className="overflow-hidden rounded-[12px] border border-line bg-surface" role="list">
        {members.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => setEditing(m)} className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-0 hover:bg-wash-2">
              <span className="grid size-7 place-items-center rounded-full bg-surface-3 text-[11px] text-fg-2">{m.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-fg-hi">
                  {m.name} {m.id === selfId && <span className="text-xs text-muted">(you)</span>}
                </span>
                <span className="block font-mono text-xs text-muted">{m.username}</span>
              </span>
              {!m.hasPassword && <Badge tone="warn">Can't sign in yet</Badge>}
              <Badge tone={m.role === "admin" ? "info" : m.role === "editor" ? "strong" : "neutral"}>{m.role}</Badge>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={current ? `Edit ${current.name}` : "Add person"}>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const pw = String(fd.get("password") ?? "");
              start(async () => {
                const res = await upsertMemberAction(
                  { username: String(fd.get("username")), name: String(fd.get("name")), email: String(fd.get("email") ?? ""), role: fd.get("role") as Member["role"], ...(pw ? { password: pw } : {}) },
                  current?.id,
                );
                if (res.ok) {
                  toast(current ? "Saved" : "Person added");
                  setEditing(null);
                } else toast.error(res.error);
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" defaultValue={current?.name} required autoFocus />
              </Field>
              <Field label="Username" htmlFor="username">
                <Input id="username" name="username" defaultValue={current?.username} required autoCapitalize="off" className="font-mono" />
              </Field>
            </div>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={current?.email ?? ""} />
            </Field>
            <Field label="Role" htmlFor="role">
              <Select id="role" name="role" defaultValue={current?.role ?? "editor"} disabled={current?.id === selfId}>
                <option value="viewer">Viewer — reads SOPs</option>
                <option value="editor">Editor — writes and publishes SOPs</option>
                <option value="admin">Admin — also manages people and folders</option>
              </Select>
            </Field>
            <Field label={current ? "Set a new password" : "Password"} htmlFor="password" hint={current ? "Leave blank to keep the current one. Setting one signs them out everywhere." : "At least 8 characters. Share it with them privately."}>
              <Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required={!current} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {current ? "Save" : "Add person"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
