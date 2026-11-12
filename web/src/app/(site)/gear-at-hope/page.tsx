import type { Metadata } from "next";
import { Suspense } from "react";
import { FileDown } from "lucide-react";
import { getContext } from "@/server/context";
import { publicRoomList, type PublicRoom } from "@/server/services/public-site";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { LayoutSvg } from "@/components/work/layout-svg";
import { SitePage, SiteTitle } from "@/components/site/site-header";

export const metadata: Metadata = { title: "Gear at Hope" };

export default function GearAtHope() {
  return (
    <SitePage>
      <SiteTitle title="Gear at Hope" intro="What's in each room, so you can plan your event. Download a room's tech packet to share with your team." />
      <Suspense fallback={<div className="h-96" />}>
        <Rooms />
      </Suspense>
    </SitePage>
  );
}

async function Rooms() {
  const { db, actor } = await getContext();
  const rooms = await publicRoomList(db, actor);
  if (!rooms.length) return <p className="text-[14px] text-muted">No rooms listed yet.</p>;
  return (
    <>
      <nav aria-label="Rooms" className="mb-8 flex flex-wrap gap-1.5">
        {rooms.map((r) => (
          <a key={r.id} href={`#room-${r.id}`} className="rounded-full border border-line px-3 py-1 text-[13px] text-fg-2 hover:border-line-2 hover:text-fg-hi">
            {r.name}
          </a>
        ))}
      </nav>
      <div className="grid gap-12">
        {rooms.map((r) => (
          <RoomSection key={r.id} room={r} />
        ))}
      </div>
    </>
  );
}

export function RoomGear({ room, print }: { room: PublicRoom; print?: boolean }) {
  if (!room.gear.length) return <p className="text-[14px] text-muted">Gear for this room is coming soon.</p>;
  return (
    <div className={print ? "grid grid-cols-2 gap-4" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"}>
      {room.gear.map((g) => (
        <section key={g.group} aria-label={`${room.name} ${g.label}`} className="break-inside-avoid rounded-[12px] border border-line bg-surface p-4">
          <h3 className="text-[13px] font-[510] text-muted">{g.label}</h3>
          <ul className="mt-2 grid gap-1.5" role="list">
            {g.items.map((it, i) => (
              <li key={i} className="text-[14px] leading-snug">
                <span className="text-fg-hi">
                  {it.qty > 1 && <span className="font-mono text-[13px] text-fg-2">{it.qty}× </span>}
                  {it.name}
                </span>
                {it.note && <span className="block text-[13px] text-muted">{it.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RoomSection({ room }: { room: PublicRoom }) {
  return (
    <section id={`room-${room.id}`} aria-labelledby={`room-h-${room.id}`} className="scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id={`room-h-${room.id}`} className="mr-auto text-[22px] font-[510] tracking-[-0.012em] text-fg-hi">
          {room.name}
        </h2>
        <Button asChild size="sm">
          <a href={`/api/public/tech-packet/${room.id}`} download>
            <FileDown /> Download tech packet (PDF)
          </a>
        </Button>
      </div>
      <RoomGear room={room} />
      {(room.plot || room.notes) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[3fr_2fr]">
          {room.plot && (
            <figure className="overflow-hidden rounded-[12px] border border-line bg-surface">
              <LayoutSvg doc={room.plot} mini />
              <figcaption className="border-t border-line px-4 py-2 text-[12px] text-muted">Stage plot · {room.plot.name}</figcaption>
            </figure>
          )}
          {room.notes && (
            <div className="rounded-[12px] border border-line bg-surface p-4">
              <h3 className="text-[13px] font-[510] text-muted">Room notes</h3>
              <Markdown source={room.notes} className="mt-1.5 text-[14px]" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
