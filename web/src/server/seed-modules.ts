import type { Executor } from "@/db";
import { workComments } from "@/db/schema";
import { addDays, today } from "@/lib/work";
import type { Actor } from "@/server/permissions";
import { createProject } from "@/server/services/projects";
import { createTask } from "@/server/services/tasks";
import { createCable, createLayout, saveLayout } from "@/server/services/cabling";
import { createBomItem, createPurchaseOrder, receivePurchaseOrder } from "@/server/services/purchasing";
import { createGear, logFirmware } from "@/server/services/gear";
import { createContractor, saveAccess, saveInvoice, savePunch, saveScope } from "@/server/services/contractors";

type Seeded = { actor: Actor; maria: { id: string }; james: { id: string } };

/** Demo projects and their work, dated around today so the schedule and reminders look alive. */
export async function seedModules(db: Executor, { actor, maria, james }: Seeded) {
  const day = (n: number) => addDays(today(), n);
  const admin = actor.userId!;
  const sanctuary = await createProject(db, actor, {
    name: "Sanctuary AV Refresh",
    status: "active",
    start: day(-30),
    end: day(60),
    color: "#5e8bd6",
    summary: "Replace the main PA, add two PTZ cameras and re-cable the booth to the stage.",
    budget: 85000,
    leadId: admin,
    description: "Phase 1 covers the booth-to-stage fiber trunk and stage boxes.\n\nPhase 2 covers the **PA swap** during the week of the 15th.",
  });
  const youth = await createProject(db, actor, {
    name: "Youth Room Install",
    status: "planning",
    start: day(14),
    end: day(75),
    color: "#b072d1",
    summary: "New projector, small mixer and stream-ready camera for the youth room.",
    budget: 18000,
    leadId: james.id,
  });

  const T = (o: Partial<Parameters<typeof createTask>[2]> & { title: string }) => createTask(db, actor, { projectId: sanctuary.id, ...o });
  const fiber = await T({
    title: "Pull fiber trunk booth → stage",
    status: "in_progress",
    priority: "high",
    assignees: [admin, james.id],
    labels: ["Cabling"],
    start: day(-6),
    due: day(2),
    description: "12-strand single-mode from Rack B to the stage left closet. Use the existing 2\" conduit along the east wall.",
  });
  await T({ title: "Terminate and test fiber ends", parentId: fiber.id, assignees: [admin], due: day(4), labels: ["Cabling"] });
  await T({ title: "Label both ends with cable IDs", parentId: fiber.id, assignees: [james.id], due: day(5), labels: ["Cabling"] });
  await T({ title: "Order PTZ cameras", status: "done", priority: "high", assignees: [admin], labels: ["Video", "Purchasing"], start: day(-25), due: day(-18) });
  await T({ title: "Mount PTZ camera brackets", status: "blocked", assignees: [james.id], labels: ["Video"], start: day(1), due: day(6), description: "Waiting on the contractor lift. See the punch list." });
  await T({ title: "Update console firmware to 5.1", status: "review", priority: "low", assignees: [maria.id], labels: ["Audio", "Firmware"], due: day(1) });
  await T({ title: "Speaker demo with vendor", priority: "urgent", assignees: [admin, maria.id], labels: ["Audio"], start: day(8), due: day(8) });
  await T({ title: "Remove old PA cluster", status: "backlog", priority: "high", labels: ["Audio", "Contractor"], start: day(20), due: day(24) });
  await T({ title: "Hang and aim new line array", status: "backlog", priority: "high", labels: ["Audio", "Contractor"], start: day(24), due: day(30) });
  await T({ title: "Tune new PA system", status: "backlog", assignees: [maria.id], labels: ["Audio"], start: day(31), due: day(33) });
  await T({ title: "Patch sheet out of date", status: "todo", priority: "medium", assignees: [admin], labels: ["Audio"], due: day(-2) });
  await createTask(db, actor, { projectId: youth.id, title: "Survey youth room power and data", assignees: [james.id], labels: ["Site Survey"], start: day(14), due: day(16) });

  const at = (daysAgo: number, hour: number) => {
    const d = new Date(Date.now() - daysAgo * 864e5);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  await db.insert(workComments).values([
    { workspaceId: actor.workspaceId, targetType: "task", targetId: fiber.id, projectId: sanctuary.id, authorId: admin, body: "Conduit is clear. @james can you bring the fish tape Thursday?", mentions: [james.id], createdAt: at(2, 14) },
    { workspaceId: actor.workspaceId, targetType: "task", targetId: fiber.id, projectId: sanctuary.id, authorId: james.id, body: "Will do. I can be there at 6pm.", createdAt: at(2, 16) },
  ]);
  const C = (o: Parameters<typeof createCable>[3]) => createCable(db, actor, sanctuary.id, { room: "Sanctuary", ...o });
  const fo = await C({ label: "FO-001", type: "Fiber SM", from: "Booth Rack B", to: "Stage Left Closet", lengthFt: 180, status: "pulled", notes: "12 strand" });
  const net14 = await C({ label: "NET-014", type: "Cat6A", from: "Booth Rack B", to: "PTZ-2 (Balcony)", lengthFt: 95, status: "tested", notes: "PoE++" });
  const net15 = await C({ label: "NET-015", type: "Cat6A", from: "Booth Rack B", to: "PTZ-3 (House Right)", lengthFt: 120, status: "terminated" });
  const sdi = await C({ label: "SDI-003", type: "12G-SDI", from: "Stage Left Closet", to: "Booth Switcher In 4", lengthFt: 160 });
  const spk = await C({ label: "SPK-001", type: "Speaker 12/4", from: "Amp Rack", to: "Main Array L", lengthFt: 140 });

  const layout = await createLayout(db, actor, sanctuary.id, "Sanctuary – Main Floor");
  await saveLayout(db, actor, layout.id, {
    name: "Sanctuary – Main Floor",
    items: [
      { id: "z1", type: "zone", label: "STAGE", x: 300, y: 40, w: 400, h: 150 },
      { id: "z2", type: "zone", label: "BOOTH", x: 420, y: 520, w: 160, h: 90 },
      { id: "z3", type: "zone", label: "SL CLOSET", x: 160, y: 60, w: 110, h: 90 },
      { id: "g1", type: "speaker", label: "Main L", x: 320, y: 220 },
      { id: "g2", type: "speaker", label: "Main R", x: 680, y: 220 },
      { id: "g3", type: "camera", label: "PTZ-2", x: 500, y: 420 },
      { id: "g4", type: "camera", label: "PTZ-3", x: 860, y: 330 },
      { id: "g5", type: "rack", label: "Rack B", x: 500, y: 570 },
      { id: "g6", type: "stagebox", label: "Stage box", x: 215, y: 110 },
      { id: "g7", type: "rack", label: "Amp rack", x: 120, y: 300 },
    ],
    runs: [
      { id: "r1", from: "g5", to: "g6", label: "FO-001", color: "#5e8bd6", cableId: fo.id, style: "elbow" },
      { id: "r2", from: "g5", to: "g3", label: "NET-014", color: "#5eb88a", cableId: net14.id },
      { id: "r3", from: "g5", to: "g4", label: "NET-015", color: "#5eb88a", cableId: net15.id, style: "elbow" },
      { id: "r4", from: "g6", to: "g5", label: "SDI-003", color: "#d6c25e", cableId: sdi.id },
      { id: "r5", from: "g7", to: "g1", label: "SPK-001", color: "#d65e7a", cableId: spk.id },
    ],
  });
  const B = (o: Parameters<typeof createBomItem>[3]) => createBomItem(db, actor, sanctuary.id, o);
  const ptz = await B({ item: "PTZ camera 4K NDI", partNumber: "PTZ-4K-20X", vendor: "B&H", category: "Video", qty: 2, unitCost: 4295 });
  await B({ item: "Line array element", partNumber: "LA-210", vendor: "Full Compass", category: "Audio", qty: 8, unitCost: 3150, status: "quoted" });
  await B({ item: "Sub 18\"", partNumber: "SUB-18", vendor: "Full Compass", category: "Audio", qty: 2, unitCost: 2890, status: "quoted" });
  const fiberBom = await B({ item: "12-strand SM fiber, plenum (ft)", partNumber: "OS2-12-PL", vendor: "Graybar", category: "Cabling", qty: 250, unitCost: 2.4 });
  const stagebox = await B({ item: "Fiber stage box 32x16", partNumber: "SB-3216", vendor: "Sweetwater", category: "Audio", qty: 1, unitCost: 6499 });
  const cat6 = await B({ item: "Cat6A shielded (1000ft box)", partNumber: "C6A-SH-1K", vendor: "Graybar", category: "Cabling", qty: 1, unitCost: 489 });

  const po1 = await createPurchaseOrder(db, actor, sanctuary.id, { poNumber: `PO-${day(0).slice(0, 4)}-031`, vendor: "B&H", date: day(-22), status: "ordered", category: "Video", lines: [{ desc: "PTZ camera 4K NDI", qty: 2, unitCost: 4295, bomItemId: ptz.id }] });
  await receivePurchaseOrder(db, actor, po1.id, { received: { [po1.lines[0].id]: 2 }, date: day(-15) });
  await createPurchaseOrder(db, actor, sanctuary.id, { poNumber: `PO-${day(0).slice(0, 4)}-034`, vendor: "Sweetwater", date: day(-10), status: "ordered", category: "Audio", notes: "ETA 2 weeks", lines: [{ desc: "Fiber stage box 32x16", qty: 1, unitCost: 6499, bomItemId: stagebox.id }] });
  const po3 = await createPurchaseOrder(db, actor, sanctuary.id, {
    poNumber: `PO-${day(0).slice(0, 4)}-035`,
    vendor: "Graybar",
    date: day(-9),
    status: "ordered",
    category: "Cabling",
    lines: [
      { desc: "12-strand SM fiber (ft)", qty: 250, unitCost: 2.4, bomItemId: fiberBom.id },
      { desc: "Cat6A shielded box", qty: 1, unitCost: 489, bomItemId: cat6.id },
      { desc: "LC connectors (24pk)", qty: 2, unitCost: 145 },
    ],
  });
  await receivePurchaseOrder(db, actor, po3.id, { received: { [po3.lines[0].id]: 250, [po3.lines[1].id]: 1 }, date: day(-4) });
  const spark = await createContractor(db, actor, { company: "Bright Spark Electric", contact: "Tom Reyes", trade: "Electrical", phone: "(555) 300-1188", email: "tom@brightspark.example", insuranceExpires: day(120), rate: "$95/hr", notes: "Licensed, did the 2024 lighting circuits." });
  const rig = await createContractor(db, actor, { company: "Summit Rigging", contact: "Alicia Grant", trade: "Rigging / Install", phone: "(555) 300-4421", email: "alicia@summitrig.example", insuranceExpires: day(20), rate: "Fixed bid" });
  await saveScope(db, actor, {
    contractorId: rig.id,
    projectId: sanctuary.id,
    title: "PA removal and line array hang",
    status: "signed",
    value: 12500,
    start: day(20),
    end: day(30),
    body: "## Scope\n- Remove existing center cluster and dispose\n- Install new rigging points per engineer drawing\n- Fly and aim 8-element array per prediction\n\n## Exclusions\n- Electrical work\n- Patching and repair of ceiling tiles",
  });
  await saveScope(db, actor, { contractorId: spark.id, projectId: sanctuary.id, title: "Dedicated circuits for amp rack", status: "sent", value: 3400, start: day(10), end: day(12), body: "- Two 20A dedicated circuits to the amp rack\n- Isolated ground" });
  await saveAccess(db, actor, { contractorId: rig.id, who: "Summit Rigging crew (4)", from: day(20), to: day(30), hours: "7:00 AM – 5:00 PM", areas: "Sanctuary, catwalk, loading dock", badge: "Key #12, Badge T-4", approvedBy: "Edwin Schuster", notes: "No work on Sunday. Lift stays in the dock overnight." });
  await saveAccess(db, actor, { contractorId: spark.id, who: "Tom Reyes", from: day(10), to: day(12), hours: "8:00 AM – 4:00 PM", areas: "Booth, electrical room B", badge: "Key #7", approvedBy: "Edwin Schuster" });
  await savePunch(db, actor, { projectId: sanctuary.id, contractorId: rig.id, location: "Balcony rail", description: "Lift access needed for PTZ-2 bracket", due: day(5) });
  await savePunch(db, actor, { projectId: sanctuary.id, contractorId: spark.id, location: "Booth", description: "Cover plate missing on floor box FB-3", status: "ready_for_review", due: day(2) });
  await saveInvoice(db, actor, { contractorId: rig.id, projectId: sanctuary.id, number: "SR-1182", date: day(-5), dueDate: day(25), amount: 6250, status: "approved", notes: "50% deposit" });
  const G = (o: Parameters<typeof createGear>[2]) => createGear(db, actor, o);
  const foh = await G({ name: "FOH Console", category: "Audio", manufacturer: "Allen & Heath", model: "dLive S5000", serial: "AH-S5K-204411", assetTag: "HCC-A-001", location: "Booth", ip: "192.168.10.10", mac: "00:04:C4:12:34:56", purchaseDate: "2021-03-12", warranty: "2026-03-12", firmware: "1.97" });
  await logFirmware(db, actor, foh.id, { version: "2.01", date: day(-60), note: "Fixes scene recall bug" });
  await G({ name: "Stage Box 1", category: "Audio", manufacturer: "Allen & Heath", model: "DX168", serial: "AH-DX-55821", assetTag: "HCC-A-014", location: "Stage Left Closet", firmware: "2.01" });
  await G({ name: "PTZ-2 Balcony", category: "Video", manufacturer: "BirdDog", model: "P400", serial: "BD-P4-00921", assetTag: "HCC-V-022", location: "Balcony", status: "spare", ip: "192.168.20.32", firmware: "5.5.112", notes: "Awaiting mount" });
  await G({ name: "Production Switcher", category: "Video", manufacturer: "Blackmagic", model: "ATEM Constellation 4K", serial: "BM-ATC-7731A", assetTag: "HCC-V-001", location: "Booth Rack B", ip: "192.168.20.10", firmware: "9.6" });
  return { sanctuary, youth };
}
