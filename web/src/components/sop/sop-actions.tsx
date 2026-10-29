"use client";

import { Archive, ArchiveRestore, CalendarCheck, ChevronDown, FileDown, History, MoreHorizontal, Pencil, GraduationCap, Settings2, Share2, Trash2, Workflow } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteSopAction, setRetiredAction, updateMetaAction } from "@/app/actions/sops";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { MarkReviewedDialog } from "./mark-reviewed";
import { ShareDialog } from "./share-dialog";

type Props = {
  sopId: string;
  title: string;
  versionQuery: string;
  canEdit: boolean;
  canManage: boolean;
  /** Drafts: the owner or an admin. Published SOPs: admins only. */
  canDelete: boolean;
  retired: boolean;
  published: boolean;
  isDraftView: boolean;
  meta: { documentCode: string; ownerId: string; folderId: string; tags: string[]; reviewIntervalDays: number; urlPatterns: string[] };
  members: { id: string; name: string }[];
  folders: { id: string; label: string }[];
};

export function SopActions(p: Props) {
  const [details, setDetails] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirm, setConfirm] = useState<null | "retire" | "delete">(null);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const pdf = (w?: string) => `/api/sops/${p.sopId}/pdf?${new URLSearchParams({ ...(p.versionQuery ? Object.fromEntries(new URLSearchParams(p.versionQuery)) : {}), ...(w ? { watermark: w } : {}) })}`;

  return (
    <>
      {p.canEdit && !p.retired && (
        <Button asChild variant="primary" size="sm">
          <Link href={`/sops/${p.sopId}/edit`}>
            <Pencil /> Edit
          </Link>
        </Button>
      )}
      <Menu>
        <MenuTrigger asChild>
          <Button size="sm">
            <FileDown /> PDF <ChevronDown className="!size-3 text-muted" />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem asChild>
            <a href={pdf()}>Download PDF</a>
          </MenuItem>
          <MenuItem asChild>
            <a href={pdf(p.isDraftView ? "draft" : "confidential")}>{p.isDraftView ? "With “Draft” watermark" : "With “Confidential” watermark"}</a>
          </MenuItem>
          {!p.isDraftView && (
            <MenuItem asChild>
              <a href={pdf("draft")}>With “Draft” watermark</a>
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
      <Button asChild size="sm" variant="ghost">
        <Link href={`/sops/${p.sopId}/history`}>
          <History /> <span className="hidden sm:inline">History</span>
        </Link>
      </Button>
      <Button asChild size="icon-sm" variant="ghost" aria-label="Flowchart" title="Flowchart">
        <Link href={`/sops/${p.sopId}/flow${p.versionQuery ? `?${p.versionQuery}` : ""}`}>
          <Workflow />
        </Link>
      </Button>
      {/* A retired SOP can't be edited, but its owner or an admin still needs this menu to restore it. */}
      {(p.canEdit || p.canManage) && (
        <Menu>
          <MenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            {p.canEdit && (
              <MenuItem onSelect={() => setDetails(true)}>
                <Settings2 /> Owner, folder, tags & review…
              </MenuItem>
            )}
            {p.published && !p.retired && (
              <MenuItem asChild>
                <Link href={`/sops/${p.sopId}/training`}>
                  <GraduationCap /> Training & quiz
                </Link>
              </MenuItem>
            )}
            {p.published && !p.retired && (
              <MenuItem onSelect={() => setSharing(true)}>
                <Share2 /> Share outside the team…
              </MenuItem>
            )}
            {p.published && !p.retired && (
              <MenuItem onSelect={() => setReviewing(true)}>
                <CalendarCheck /> Mark as reviewed…
              </MenuItem>
            )}
            {p.canManage && (
              <>
                {p.canEdit && <MenuSeparator />}
                {p.retired ? (
                  <MenuItem onSelect={() => start(async () => void toast((await setRetiredAction(p.sopId, false)).ok ? "Restored" : "Couldn't restore"))}>
                    <ArchiveRestore /> Restore
                  </MenuItem>
                ) : (
                  <MenuItem onSelect={() => setConfirm("retire")}>
                    <Archive /> Retire…
                  </MenuItem>
                )}
                {p.canDelete && (
                  <MenuItem
                    danger
                    onSelect={() => {
                      setTyped("");
                      setConfirm("delete");
                    }}
                  >
                    <Trash2 /> Delete…
                  </MenuItem>
                )}
              </>
            )}
          </MenuContent>
        </Menu>
      )}
      <ThemeToggle />

      <MarkReviewedDialog sopId={p.sopId} title={p.title} open={reviewing} onOpenChange={setReviewing} />
      {p.canEdit && <ShareDialog sopId={p.sopId} open={sharing} onOpenChange={setSharing} />}

      <Dialog open={details} onOpenChange={setDetails}>
        <DialogContent title="SOP details" description="These apply to every version. Changes to a published SOP are recorded in its audit log.">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              start(async () => {
                const res = await updateMetaAction(p.sopId, {
                  ...(p.canManage ? { ownerId: String(fd.get("owner")) } : {}),
                  ...(p.canManage ? (fd.get("newCode") ? { newCodeForFolder: true } : { documentCode: String(fd.get("code") ?? "") }) : {}),
                  folderId: String(fd.get("folder")),
                  tags: String(fd.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
                  reviewIntervalDays: Number(fd.get("interval")),
                  urlPatterns: String(fd.get("pages") ?? "").split(/[\n,]/).map((t) => t.trim()).filter(Boolean),
                });
                if (res.ok) {
                  toast("Details saved");
                  setDetails(false);
                } else toast.error(res.error);
              });
            }}
          >
            <Field label="Owner" htmlFor="owner" hint={p.canManage ? "Exactly one owner. They keep this SOP accurate." : "Only the owner or an admin can change this."}>
              <Select id="owner" name="owner" defaultValue={p.meta.ownerId} disabled={!p.canManage}>
                {p.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Document code" htmlFor="code" hint={p.canManage ? "Letters, numbers and dashes. Each SOP needs its own." : "Only the owner or an admin can change this."}>
              <Input id="code" name="code" defaultValue={p.meta.documentCode} disabled={!p.canManage} className="font-mono uppercase" maxLength={40} required />
            </Field>
            <Field label="Folder" htmlFor="folder" hint="Moving it keeps its document code unless you tick the box below.">
              <Select id="folder" name="folder" defaultValue={p.meta.folderId}>
                {p.folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            {p.canManage && (
              <label className="-mt-2 flex items-center gap-2 text-[13px] text-fg-2">
                <input type="checkbox" name="newCode" className="size-4 accent-[var(--cta)]" />
                Give it the next code in the chosen folder
              </label>
            )}
            <Field label="Tags" htmlFor="tags" hint="Comma separated">
              <Input id="tags" name="tags" defaultValue={p.meta.tags.join(", ")} />
            </Field>
            <Field label="Web pages" htmlFor="pages" hint="The browser extension suggests this SOP on these pages. One per line, * for anything, e.g. studio.youtube.com/*">
              <Textarea id="pages" name="pages" rows={2} defaultValue={p.meta.urlPatterns.join("\n")} />
            </Field>
            <Field label="Review every (days)" htmlFor="interval" hint="The next review date is counted from the last publish.">
              <Input id="interval" name="interval" type="number" min={7} max={3650} defaultValue={p.meta.reviewIntervalDays} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDetails(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent title={confirm === "delete" ? "Delete this SOP?" : "Retire this SOP?"}>
          <p className="text-[14px] text-fg-2">
            {confirm !== "delete"
              ? "Readers will no longer see it and it can't be edited. Its version history is kept, and you can restore it later."
              : p.published
                ? "This permanently removes it with every version, comment, feedback, run, training record and share link. It can't be undone. To only hide it, retire it instead."
                : "It has never been published, so nothing is lost from history. This can't be undone."}
          </p>
          {confirm === "delete" && p.published && (
            <Field label={`Type “${p.title}” to confirm`} htmlFor="confirm-delete" className="mt-4">
              <Input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
            </Field>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending || (confirm === "delete" && p.published && typed.trim() !== p.title.trim())}
              onClick={() =>
                start(async () => {
                  const res = confirm === "delete" ? await deleteSopAction(p.sopId) : await setRetiredAction(p.sopId, true);
                  if (res && !res.ok) toast.error(res.error);
                  else toast(confirm === "delete" ? "Deleted" : "Retired");
                  setConfirm(null);
                })
              }
            >
              {confirm === "delete" ? (p.published ? "Delete forever" : "Delete") : "Retire"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
