"use client";

import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createFolderAction, deleteFolderAction, updateFolderAction } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";

type Folder = { id: string; name: string; parentId: string | null; codePrefix: string; visibility: "public" | "members" | "editors"; depth: number; count: number };
const VIS = { public: "Anyone, signed in or not", members: "Signed-in team members", editors: "Editors and admins only" } as const;

export function FolderManager({ folders }: { folders: Folder[] }) {
  const [editing, setEditing] = useState<Folder | "new" | null>(null);
  const [pending, start] = useTransition();
  const current = editing === "new" ? null : editing;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" onClick={() => setEditing("new")}>
          <FolderPlus /> New folder
        </Button>
      </div>
      <ul className="overflow-hidden rounded-[12px] border border-line bg-surface" role="list">
        {folders.map((f) => (
          <li key={f.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0" style={{ paddingLeft: 16 + f.depth * 20 }}>
            <span className="min-w-0 flex-1 truncate text-[14px] text-fg-hi">{f.name}</span>
            <span className="font-mono text-xs text-muted">SOP-{f.codePrefix}</span>
            <Badge tone={f.visibility === "public" ? "good" : f.visibility === "editors" ? "warn" : "neutral"}>{f.visibility}</Badge>
            <span className="w-14 text-right font-mono text-xs text-faint">{f.count} SOP{f.count === 1 ? "" : "s"}</span>
            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${f.name}`} onClick={() => setEditing(f)}>
              <Pencil />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete ${f.name}`}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteFolderAction(f.id);
                  if (res.ok) toast("Folder deleted");
                  else toast.error(res.error);
                })
              }
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={current ? `Edit ${current.name}` : "New folder"}>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const input = {
                name: String(fd.get("name")),
                codePrefix: String(fd.get("prefix")),
                visibility: String(fd.get("visibility")) as Folder["visibility"],
                parentId: (fd.get("parent") as string) || null,
              };
              start(async () => {
                const res = current ? await updateFolderAction(current.id, input) : await createFolderAction(input);
                if (res.ok) {
                  toast(current ? "Folder saved" : "Folder created");
                  setEditing(null);
                } else toast.error(res.error);
              });
            }}
          >
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" defaultValue={current?.name} required maxLength={80} autoFocus />
            </Field>
            <Field label="Code prefix" htmlFor="prefix" hint="2–8 letters or digits. Existing document codes never change.">
              <Input id="prefix" name="prefix" defaultValue={current?.codePrefix} required pattern="[A-Za-z0-9]{2,8}" className="font-mono uppercase" />
            </Field>
            <Field label="Who can read SOPs in this folder" htmlFor="visibility">
              <Select id="visibility" name="visibility" defaultValue={current?.visibility ?? "members"}>
                {Object.entries(VIS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Inside folder" htmlFor="parent">
              <Select id="parent" name="parent" defaultValue={current?.parentId ?? ""}>
                <option value="">Top level (department)</option>
                {folders
                  .filter((f) => f.id !== current?.id)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {"  ".repeat(f.depth)}
                      {f.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {current ? "Save" : "Create folder"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
