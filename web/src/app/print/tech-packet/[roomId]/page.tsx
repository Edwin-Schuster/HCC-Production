import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { AppError } from "@/server/errors";
import { publicRoom } from "@/server/services/public-site";
import { Markdown } from "@/components/markdown";
import { LayoutSvg } from "@/components/work/layout-svg";
import { RoomGear } from "@/app/(site)/gear-at-hope/page";

export const metadata: Metadata = { title: "Tech packet", robots: { index: false } };

/** A room's tech packet, for the PDF: public gear, stage plot and notes only. */
export default function TechPacketPage(props: PageProps<"/print/tech-packet/[roomId]">) {
  return (
    <Suspense>
      <Packet params={props.params} />
    </Suspense>
  );
}

async function Packet({ params }: { params: PageProps<"/print/tech-packet/[roomId]">["params"] }) {
  const { roomId } = await params;
  const { db, actor } = await getContext();
  let room;
  try {
    room = await publicRoom(db, actor, roomId);
  } catch (e) {
    if (e instanceof AppError && e.status < 500) notFound();
    throw e;
  }
  return (
    <div data-theme="light" className="min-h-dvh bg-white px-8 py-8 text-[#1d1e21] print:p-0">
      <header className="mb-6 border-b border-[#dcdee3] pb-4">
        <p className="text-xs font-[510] uppercase tracking-[0.06em] text-[#5f636a]">HCC Production · Tech packet</p>
        <h1 className="mt-1 text-[28px] font-[510] tracking-[-0.022em] text-black">{room.name}</h1>
      </header>
      <h2 className="mb-3 text-[16px] font-[510] text-black">Gear</h2>
      <RoomGear room={room} print />
      {room.plot && (
        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-3 text-[16px] font-[510] text-black">Stage plot</h2>
          <div className="overflow-hidden rounded-[8px] border border-[#dcdee3]">
            <LayoutSvg doc={room.plot} />
          </div>
        </section>
      )}
      {room.notes && (
        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-2 text-[16px] font-[510] text-black">Power, load-in and stage</h2>
          <Markdown source={room.notes} className="text-[13.5px]" />
        </section>
      )}
    </div>
  );
}
