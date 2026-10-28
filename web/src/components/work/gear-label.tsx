import { formatDay } from "@/lib/format";
import type { GearItem } from "@/server/services/gear";

/** The equipment label: asset tag, model, serial, IP and firmware. Prints at about 3.5 × 2 in. */
export function GearLabel({ g, org }: { g: Pick<GearItem, "name" | "assetTag" | "model" | "serial" | "ip" | "firmware" | "firmwareUpdated">; org: string }) {
  return (
    <div className="w-full max-w-[3.5in] break-inside-avoid rounded-[6px] border-2 border-current bg-white px-3 py-2 font-sans text-black" data-testid="gear-label">
      <div className="flex items-center justify-between border-b border-black/30 pb-1 text-[10px] font-[600] uppercase tracking-[0.08em]">
        <span>{org}</span>
        <span className="font-mono">{g.assetTag}</span>
      </div>
      <div className="py-1 text-[15px] font-[600] leading-tight">{g.name}</div>
      <dl className="grid grid-cols-[34px_1fr] gap-x-2 font-mono text-[11px] leading-[1.35]">
        <dt className="text-black/60">MODEL</dt>
        <dd className="font-[600]">{g.model || "—"}</dd>
        <dt className="text-black/60">S/N</dt>
        <dd className="font-[600]">{g.serial || "—"}</dd>
        <dt className="text-black/60">IP</dt>
        <dd className="font-[600]">{g.ip || "—"}</dd>
        <dt className="text-black/60">FW</dt>
        <dd className="font-[600]">
          {g.firmware || "—"}
          {g.firmwareUpdated && <span className="font-normal text-black/60"> · {formatDay(g.firmwareUpdated)}</span>}
        </dd>
      </dl>
    </div>
  );
}
