"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteProjectAction, saveProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/work";
import type { Project } from "@/server/services/projects";

export type Member = { id: string; name: string; username: string };

/** "New project" or "Edit" button with its dialog. */
export function ProjectFormButton({ project, members }: { project?: Project; members: Member[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      {project ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Pencil /> Edit
        </Button>
      ) : (
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus /> New project
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={project ? `Edit ${project.name}` : "New project"} wide>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const s = (k: string) => String(fd.get(k) ?? "");
              start(async () => {
                const res = await saveProjectAction(
                  {
                    name: s("name"),
                    status: s("status") as ProjectStatus,
                    start: s("start") || null,
                    end: s("end") || null,
                    color: s("color"),
                    summary: s("summary"),
                    description: s("description"),
                    budget: Number(s("budget") || 0),
                    leadId: s("leadId") || null,
                  },
                  project?.id,
                );
                if (!res.ok) return void toast.error(res.error);
                setOpen(false);
                if (!project) router.push(`/projects/${res.data.id}`);
              });
            }}
          >
            <div className="grid grid-cols-[1fr_auto] gap-4">
              <Field label="Name" htmlFor="pr-name">
                <Input id="pr-name" name="name" defaultValue={project?.name} required autoFocus maxLength={120} />
              </Field>
              <Field label="Colour" htmlFor="pr-color">
                <Input id="pr-color" name="color" type="color" defaultValue={project?.color ?? "#5e8bd6"} className="w-14 cursor-pointer px-1" />
              </Field>
            </div>
            <Field label="Summary" htmlFor="pr-summary" hint="One line. Everyone on the team can see this, the status and the dates.">
              <Input id="pr-summary" name="summary" defaultValue={project?.summary} maxLength={300} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Status" htmlFor="pr-status">
                <Select id="pr-status" name="status" defaultValue={project?.status ?? "planning"}>
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PROJECT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Start" htmlFor="pr-start">
                <Input id="pr-start" name="start" type="date" defaultValue={project?.start ?? ""} />
              </Field>
              <Field label="Finish" htmlFor="pr-end">
                <Input id="pr-end" name="end" type="date" defaultValue={project?.end ?? ""} />
              </Field>
              <Field label="Budget ($)" htmlFor="pr-budget">
                <Input id="pr-budget" name="budget" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={project ? project.budgetCents / 100 : ""} />
              </Field>
            </div>
            <Field label="Lead" htmlFor="pr-lead">
              <Select id="pr-lead" name="leadId" defaultValue={project?.leadId ?? ""}>
                <option value="">No lead</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" htmlFor="pr-desc" hint="Markdown. Editors only.">
              <Textarea id="pr-desc" name="description" defaultValue={project?.description} rows={6} className="font-mono text-[13px]" />
            </Field>
            <div className="flex items-center gap-2">
              {project && (
                <Button
                  type="button"
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Delete ${project.name}? Its tasks, cables, layouts, purchasing and contractor work are deleted too. This can't be undone.`)) return;
                    start(async () => {
                      const res = await deleteProjectAction(project.id);
                      if (res && !res.ok) toast.error(res.error);
                    });
                  }}
                >
                  <Trash2 /> Delete
                </Button>
              )}
              <span className="flex-1" />
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {project ? "Save" : "Create project"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
