"use client";

import { Camera, Download, ImagePlus, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { addPhotosAction, deletePhotoAction, updatePhotoAction } from "@/app/actions/projects";
import { Ago } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { downloadCsv, slug } from "@/lib/csv";
import type { Photo } from "@/server/services/photos";
import { RecordDialog, type ActionResult } from "./record-dialog";
import { uploadAttachment } from "./task-drawer";

const asResult = (r: { ok: boolean; error?: string }): ActionResult => (r.ok ? { ok: true } : { ok: false, error: r.error ?? "Couldn't save" });

/** Site photos: take them on a phone and they upload straight into the project, tagged with where they were taken. */
export function ProjectPhotos({ projectId, projectName, photos }: { projectId: string; projectName: string; photos: Photo[] }) {
  const [where, setWhere] = useState("");
  const [location, setLocation] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [editing, setEditing] = useState<Photo | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const locations = [...new Set(photos.map((p) => p.location).filter(Boolean))].sort();
  const shown = where ? photos.filter((p) => p.location === where) : photos;

  const upload = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    try {
      const done: { url: string; mime: string }[] = [];
      for (const [i, f] of files.entries()) {
        setUploading(`Uploading ${i + 1} of ${files.length}…`);
        const a = await uploadAttachment(f);
        if (!a.mime?.startsWith("image/") && !a.mime?.startsWith("video/")) throw new Error(`${f.name} isn't a photo or video.`);
        done.push({ url: a.url, mime: a.mime });
      }
      const res = await addPhotosAction(projectId, { files: done, location });
      if (!res.ok) throw new Error(res.error);
      toast(done.length === 1 ? "Photo added" : `${done.length} photos added`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
        <input ref={picker} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
        <Button variant="primary" disabled={!!uploading} onClick={() => camera.current?.click()}>
          <Camera /> Take photo
        </Button>
        <Button disabled={!!uploading} onClick={() => picker.current?.click()}>
          <ImagePlus /> Upload
        </Button>
        <Input value={location} onChange={(e) => setLocation(e.target.value)} list="photo-locations" placeholder="Location for new photos" aria-label="Location for new photos" className="h-8 w-52" />
        <datalist id="photo-locations">
          {locations.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        {uploading && <span className="text-xs text-muted" role="status">{uploading}</span>}
        <span className="flex-1" />
        {locations.length > 0 && (
          <Select value={where} onChange={(e) => setWhere(e.target.value)} aria-label="Show location" className="h-8 w-auto md:text-[13px]">
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
        )}
        {photos.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => downloadCsv(`photos-${slug(projectName)}`, [["Caption", "Location", "Taken by", "Date", "Link"], ...shown.map((p) => [p.caption, p.location, p.takenByName ?? "", p.createdAt.slice(0, 10), p.url])])}>
            <Download /> CSV
          </Button>
        )}
      </div>
      {shown.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="list" aria-label="Photos">
          {shown.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-[12px] border border-line bg-surface">
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="block bg-bg">
                {p.mime.startsWith("video/") ? (
                  <video src={p.url} muted preload="metadata" className="aspect-[4/3] w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded photo
                  <img src={p.url} alt={p.caption || p.location || "Site photo"} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                )}
              </a>
              <div className="flex items-start gap-1 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-fg-hi">{p.caption || <span className="text-muted">No caption</span>}</p>
                  <p className="truncate text-xs text-muted">
                    {[p.location, p.takenByName].filter(Boolean).join(" · ")} · <Ago iso={p.createdAt} />
                  </p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label="Edit caption" onClick={() => setEditing(p)}>
                  <Pencil />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[12px] border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted">No photos yet. Document the site as you work: photos from your phone camera upload straight here.</p>
      )}
      {editing && (
        <RecordDialog
          open
          title="Photo"
          fields={[
            { name: "caption", label: "Caption", type: "text", wide: true },
            { name: "location", label: "Location", type: "text", list: locations, wide: true },
          ]}
          initial={editing}
          onSave={async (v) => asResult(await updatePhotoAction(editing.id, { caption: v.caption, location: v.location }))}
          onDelete={async () => asResult(await deletePhotoAction(editing.id))}
          confirmDelete="Delete this photo?"
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
