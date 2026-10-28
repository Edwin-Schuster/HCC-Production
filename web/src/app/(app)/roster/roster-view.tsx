"use client";

import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { checkInAction, deletePersonAction, deleteRoleAction, savePersonAction, saveRoleAction } from "@/app/actions/roster";
import { Ago, useNow } from "@/components/local-date";
import { Empty, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PERSON_STATUSES, PERSON_STATUS_LABEL, freshness, type PersonStatus } from "@/lib/roster";
import { StatusDot } from "@/components/work/badges";
import { cn } from "@/lib/utils";
import type { RosterPerson, RosterRole } from "@/server/services/roster";

type Account = { id: string; name: string; username: string };

const FRESH = { fresh: "text-good", recent: "text-muted", stale: "text-warn" } as const;


function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function RosterView({ people, roles, me, accounts, canEdit, checkIn = false }: { people: RosterPerson[]; roles: RosterRole[]; me: RosterPerson | null; accounts: Account[]; canEdit: boolean; checkIn?: boolean }) {
  const [checkingIn, setCheckingIn] = useState<RosterPerson | null>(checkIn ? me : null);
  const [editing, setEditing] = useState<RosterPerson | "new" | null>(null);
  const [editingRole, setEditingRole] = useState<RosterRole | "new" | null>(null);
  const now = useNow();
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const counts = PERSON_STATUSES.map((s) => [s, people.filter((p) => p.status === s).length] as const).filter(([, n]) => n);

  return (
    <>
      <PageHeader
        title="Roster"
        subtitle={`${people.length} ${people.length === 1 ? "person" : "people"} on the production team${counts.length ? " · " + counts.map(([s, n]) => `${n} ${PERSON_STATUS_LABEL[s].toLowerCase()}`).join(" · ") : ""}`}
        actions={
          <>
            {me && (
              <Button variant="primary" onClick={() => setCheckingIn(me)}>
                <MapPin /> Check in
              </Button>
            )}
            {canEdit && (
              <Button onClick={() => setEditing("new")}>
                <Plus /> Person
              </Button>
            )}
          </>
        }
      />
      {!me && <p className="mb-4 rounded-[8px] border border-line bg-surface px-4 py-2.5 text-[13px] text-muted">Your account isn&apos;t linked to the roster yet, so you can&apos;t check in. Ask an editor to link it.</p>}

      {people.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {people.map((p) => {
            const fresh = now === null ? null : freshness(p.lastCheckIn, now);
            return (
              <li key={p.id} className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface p-4" data-testid="person-card">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-3 text-[13px] font-[510] text-fg-2">{initials(p.name)}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-[510] text-fg-hi">
                      {p.name} {p.id === me?.id && <span className="text-xs font-normal text-muted">(you)</span>}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.roleIds.map((id) => roleById.get(id)).filter(Boolean).map((r) => (
                        <span key={r!.id} className="inline-flex items-center gap-1 rounded-[4px] bg-wash px-1.5 text-xs leading-[18px] text-fg-2">
                          <span className="size-1.5 rounded-full" style={{ background: r!.color }} aria-hidden />
                          {r!.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                      <Pencil />
                    </Button>
                  )}
                </div>
                <div className="flex items-baseline gap-2 text-[13px]">
                  <StatusDot status={p.status} />
                  <span className="font-[510] text-fg-hi">{PERSON_STATUS_LABEL[p.status]}</span>
                  {p.statusNote && <span className="min-w-0 truncate text-muted">— {p.statusNote}</span>}
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={cn("flex items-center gap-1", fresh ? FRESH[fresh] : "text-muted")}>
                    <MapPin className="size-3" /> Last check-in <Ago iso={p.lastCheckIn} />
                  </span>
                  {(canEdit || p.id === me?.id) && (
                    <Button variant="link" className="text-xs" onClick={() => setCheckingIn(p)}>
                      Update
                    </Button>
                  )}
                </div>
                {(p.phone || p.email) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2.5 font-mono text-xs text-fg-2">
                    {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="hover:text-fg-hi">{p.phone}</a>}
                    {p.email && <a href={`mailto:${p.email}`} className="truncate hover:text-fg-hi">{p.email}</a>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="No one on the roster yet">{canEdit ? "Add the people on your production team so they can check in." : "An editor hasn't added anyone yet."}</Empty>
      )}

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-[510] text-fg-hi">Production roles</h2>
          {canEdit && (
            <Button size="sm" onClick={() => setEditingRole("new")}>
              <Plus /> Role
            </Button>
          )}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {roles.map((r) => {
            const filled = people.filter((p) => p.roleIds.includes(r.id));
            return (
              <li key={r.id} className="rounded-[12px] border border-line bg-surface p-4" style={{ borderTop: `2px solid ${r.color}` }}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[14px] font-[510] text-fg-hi">{r.name}</h3>
                  {canEdit && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`} onClick={() => setEditingRole(r)}>
                      <Pencil />
                    </Button>
                  )}
                </div>
                {r.description && <p className="mt-1 text-[13px] text-muted">{r.description}</p>}
                <div className="mt-2 grid gap-1 text-[13px] text-fg-2">
                  {filled.length ? (
                    filled.map((p) => (
                      <span key={p.id} className="flex items-center gap-2">
                        <StatusDot status={p.status} /> {p.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-warn">No one assigned</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <CheckInDialog person={checkingIn} self={checkingIn?.id === me?.id} onClose={() => setCheckingIn(null)} />
      {canEdit && <PersonDialog key={editing === "new" ? "new" : editing?.id} person={editing} roles={roles} accounts={accounts} people={people} onClose={() => setEditing(null)} />}
      {canEdit && <RoleDialog key={editingRole === "new" ? "new" : editingRole?.id} role={editingRole} onClose={() => setEditingRole(null)} />}
    </>
  );
}

function CheckInDialog({ person, self, onClose }: { person: RosterPerson | null; self: boolean; onClose: () => void }) {
  const [pending, start] = useTransition();
  return (
    <Dialog open={person !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={self ? "Check in" : `Update ${person?.name}`} description="Let the team know where you are.">
        {person && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              start(async () => {
                const res = await checkInAction({ status: fd.get("status") as PersonStatus, note: String(fd.get("note") ?? ""), personId: self ? undefined : person.id });
                if (res.ok) {
                  toast(self ? "Checked in" : "Updated");
                  onClose();
                } else toast.error(res.error);
              });
            }}
          >
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-xs font-[510] text-muted">Status</legend>
              {PERSON_STATUSES.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2.5 rounded-[6px] border border-line px-3 py-2 text-[13px] text-fg-2 has-[:checked]:border-fg-2 has-[:checked]:text-fg-hi">
                  <input type="radio" name="status" value={s} defaultChecked={person.status === s} className="accent-[var(--color-cta)]" />
                  <StatusDot status={s} /> {PERSON_STATUS_LABEL[s]}
                </label>
              ))}
            </fieldset>
            <Field label="Note" htmlFor="ci-note" hint="Optional, e.g. “FOH for both services”.">
              <Input id="ci-note" name="note" defaultValue={person.statusNote} maxLength={200} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {self ? "Check in" : "Save"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PersonDialog({ person, roles, accounts, people, onClose }: { person: RosterPerson | "new" | null; roles: RosterRole[]; accounts: Account[]; people: RosterPerson[]; onClose: () => void }) {
  const [pending, start] = useTransition();
  const current = person === "new" ? null : person;
  const linked = new Map(people.filter((p) => p.userId && p.id !== current?.id).map((p) => [p.userId!, p.name]));
  return (
    <Dialog open={person !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={current ? `Edit ${current.name}` : "Add person"}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const res = await savePersonAction(
                { name: String(fd.get("name")), email: String(fd.get("email") ?? ""), phone: String(fd.get("phone") ?? ""), roleIds: fd.getAll("roleIds").map(String), userId: String(fd.get("userId") || "") || null },
                current?.id,
              );
              if (res.ok) {
                toast(current ? "Saved" : "Person added");
                onClose();
              } else toast.error(res.error);
            });
          }}
        >
          <Field label="Name" htmlFor="p-name">
            <Input id="p-name" name="name" defaultValue={current?.name} required autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" htmlFor="p-phone">
              <Input id="p-phone" name="phone" type="tel" defaultValue={current?.phone} />
            </Field>
            <Field label="Email" htmlFor="p-email">
              <Input id="p-email" name="email" type="email" defaultValue={current?.email} />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-xs font-[510] text-muted">Roles</legend>
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-fg-2 has-[:checked]:border-fg-2 has-[:checked]:bg-wash has-[:checked]:text-fg-hi">
                  <input type="checkbox" name="roleIds" value={r.id} defaultChecked={current?.roleIds.includes(r.id)} className="sr-only" />
                  <span className="size-1.5 rounded-full" style={{ background: r.color }} aria-hidden />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Account" htmlFor="p-user" hint="Linking an account lets them check themselves in.">
            <Select id="p-user" name="userId" defaultValue={current?.userId ?? ""}>
              <option value="">Not linked</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={linked.has(a.id)}>
                  {a.name} ({a.username}){linked.has(a.id) ? ` — linked to ${linked.get(a.id)}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center gap-2">
            {current && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove ${current.name} from the roster?`)) return;
                  start(async () => {
                    const res = await deletePersonAction(current.id);
                    if (res.ok) onClose();
                    else toast.error(res.error);
                  });
                }}
              >
                <Trash2 /> Remove
              </Button>
            )}
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {current ? "Save" : "Add person"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({ role, onClose }: { role: RosterRole | "new" | null; onClose: () => void }) {
  const [pending, start] = useTransition();
  const current = role === "new" ? null : role;
  return (
    <Dialog open={role !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={current ? `Edit ${current.name}` : "Add role"}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const res = await saveRoleAction({ name: String(fd.get("name")), description: String(fd.get("description") ?? ""), color: String(fd.get("color")) }, current?.id);
              if (res.ok) onClose();
              else toast.error(res.error);
            });
          }}
        >
          <div className="grid grid-cols-[1fr_auto] gap-4">
            <Field label="Name" htmlFor="r-name">
              <Input id="r-name" name="name" defaultValue={current?.name} required autoFocus />
            </Field>
            <Field label="Colour" htmlFor="r-color">
              <Input id="r-color" name="color" type="color" defaultValue={current?.color ?? "#a3a3a3"} className="w-14 cursor-pointer px-1" />
            </Field>
          </div>
          <Field label="What they do" htmlFor="r-desc">
            <Textarea id="r-desc" name="description" defaultValue={current?.description} maxLength={500} />
          </Field>
          <div className="flex items-center gap-2">
            {current && (
              <Button
                type="button"
                variant="danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Delete the ${current.name} role? It's taken off everyone who has it, and SOP steps assigned to it will show no role.`)) return;
                  start(async () => {
                    const res = await deleteRoleAction(current.id);
                    if (res.ok) onClose();
                    else toast.error(res.error);
                  });
                }}
              >
                <Trash2 /> Delete
              </Button>
            )}
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
