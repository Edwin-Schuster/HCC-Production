import { eq } from "drizzle-orm";
import type { Executor } from "@/db";
import { folders, sops, teamRoles, users, workspaceMembers } from "@/db/schema";
import { callout, check, code, divider, h, image, p, snippetRef, step, table } from "@/blocks/build";
import type { Actor } from "@/server/permissions";
import { createSop, publishDraft, saveDraft, getOrCreateDraft } from "@/server/services/sops";
import { createSnippet } from "@/server/services/snippets";
import { DEFAULT_TEAM_ROLES } from "./bootstrap";

const RACK_SVG = "/seed/rack-diagram.svg";

/** Demo content so the app is useful the moment it starts. */
export async function seedDemoContent(db: Executor, workspaceId: string) {
  const roleRows = await db
    .insert(teamRoles)
    .values(DEFAULT_TEAM_ROLES.map((name) => ({ workspaceId, name })))
    .returning();
  const role = (name: string) => roleRows.find((r) => r.name.startsWith(name))!.id;

  const [admin] = await db.select().from(users).limit(1);
  // Demo teammates exist as owners but can't sign in until an admin sets a password.
  const [maria, james] = await db
    .insert(users)
    .values([
      { username: "maria", name: "Maria Lopez", email: "maria@example.org" },
      { username: "james", name: "James Carter", email: "james@example.org" },
    ])
    .returning();
  await db.insert(workspaceMembers).values([
    { workspaceId, userId: maria.id, role: "editor" },
    { workspaceId, userId: james.id, role: "editor" },
  ]);

  const f = await db
    .insert(folders)
    .values([
      { workspaceId, name: "Getting Started", codePrefix: "GEN", visibility: "public", position: 0 },
      { workspaceId, name: "Sunday Service", codePrefix: "SVC", visibility: "public", position: 1 },
      { workspaceId, name: "Audio", codePrefix: "AUD", visibility: "members", position: 2 },
      { workspaceId, name: "Video & Stream", codePrefix: "VID", visibility: "members", position: 3 },
      { workspaceId, name: "Maintenance", codePrefix: "MNT", visibility: "editors", requiredApprovals: 1, position: 4 },
    ])
    .returning();
  const folder = (name: string) => f.find((x) => x.name === name)!.id;
  await db.insert(folders).values({ workspaceId, name: "Wireless", codePrefix: "RF", visibility: "members", parentId: folder("Audio"), position: 0 });
  const [rf] = await db.select().from(folders).where(eq(folders.codePrefix, "RF")).limit(1);

  const actor: Actor = { userId: admin.id, name: admin.name, username: admin.username, role: "admin", workspaceId };
  const write = async (sopId: string, title: string, summary: string, blocks: ReturnType<typeof step>[]) => {
    const { draft } = await getOrCreateDraft(db, actor, sopId);
    await saveDraft(db, actor, sopId, { title, summary, blocks, baseUpdatedAt: draft.updatedAt.toISOString() });
  };

  // 1. Sunday System Startup: two published versions, shows history.
  const startup = await createSop(db, actor, {
    title: "Sunday System Startup",
    folderId: folder("Sunday Service"),
    summary: "Power-up order for the sanctuary systems before the first service.",
    tags: ["sunday", "power", "audio", "video"],
    reviewIntervalDays: 180,
  });
  const startupV1 = () => [
    callout("warning", "**Power order matters.** Amplifiers are always last on and first off. Powering amps before the console sends a thump through the PA that can damage drivers."),
    h("Before you start"),
    check("Booth key from the lockbox"),
    check("Run sheet printed for both services"),
    h("Procedure"),
    step("Unlock the booth and turn on the UPS", { roleId: role("Technical"), minutes: 2, expected: "UPS front panel shows **Online** and battery at 100%." }),
    step("Power the stage racks", { roleId: role("Technical"), minutes: 3, description: "Turn on the sequencer in Rack A and wait for every stage box I/O light to go solid." }),
    step("Start the audio console", { roleId: role("Audio"), minutes: 4, expected: "Sample rate reads 48 kHz." }, [
      step("Load the show file", { description: "Load `Sunday_Main_v12` from the internal drive." }),
      step("Recall scene 1 · Walk-in"),
    ]),
    step("Start the video system", { roleId: role("Video"), minutes: 5 }, [step("Turn on the switcher and the PTZ cameras"), step("Recall camera preset 1 on every PTZ")]),
    step("Turn on the amplifiers", { roleId: role("Audio"), minutes: 1, warning: "Only after the console is fully booted.", expected: "Green **Ready** light on every amp." }),
    step("Line check with the band", { roleId: role("Audio"), minutes: 15, description: "Walk every input. Mark failures on the patch sheet." }),
  ];
  await write(startup.id, "Sunday System Startup", "Power-up order for the sanctuary systems before the first service.", startupV1());
  await publishDraft(db, actor, startup.id, { changeSummary: "First version, moved from the old handbook." });
  const v2 = startupV1();
  v2.splice(
    4, // before the Procedure heading
    0,
    h("Reference"),
    image(RACK_SVG, "Booth racks, front view"),
    table([
      ["Rack", "Breaker", "Location"],
      ["Rack A", "B-12", "Stage left closet"],
      ["Rack B", "B-14", "Booth"],
      ["Amp rack", "B-15 / B-16", "Amp room"],
    ]),
  );
  await write(startup.id, "Sunday System Startup", "Power-up order for the sanctuary systems before the first service.", v2);
  await publishDraft(db, actor, startup.id, { changeSummary: "Added the rack diagram and breaker table." });

  // 2. A shared snippet and an SOP that uses it.
  const ampsOff = await createSnippet(db, actor, {
    name: "Amplifier power-down",
    description: "Safe order for turning the PA off. Used by every shutdown SOP.",
    blocks: [
      callout("danger", "Amps go off **first**. Never power down the console while the amps are on."),
      step("Mute the main L/R and sub buses", { roleId: role("Audio"), minutes: 1 }),
      step("Turn off the amplifiers, rack by rack", { roleId: role("Audio"), minutes: 2, expected: "All amp front panels dark." }),
    ],
  });
  const shutdown = await createSop(db, actor, {
    title: "Sunday System Shutdown",
    folderId: folder("Sunday Service"),
    summary: "Power-down order after the last service.",
    tags: ["sunday", "power", "audio"],
    reviewIntervalDays: 180,
  });
  await write(shutdown.id, "Sunday System Shutdown", "Power-down order after the last service.", [
    h("Procedure"),
    step("Save the console show file", { roleId: role("Audio"), minutes: 2, description: "Save over `Sunday_Main_v12` only if the changes should carry into next week." }),
    snippetRef(ampsOff.id),
    step("Power down the video system", { roleId: role("Video"), minutes: 3 }),
    step("Turn off the stage racks with the sequencer", { roleId: role("Technical"), minutes: 1 }),
    step("Lock the booth and return the key", { minutes: 1 }),
  ]);
  await publishDraft(db, actor, shutdown.id, { changeSummary: "First version." });

  // 3. Livestream Go-Live Checklist
  const live = await createSop(db, actor, {
    title: "Livestream Go-Live",
    folderId: folder("Video & Stream"),
    summary: "Everything to verify before the stream goes live at 8:55.",
    tags: ["stream", "youtube", "sunday"],
    ownerId: james.id,
    reviewIntervalDays: 90,
  });
  const fallback = step("Restart the encoder and re-enter the stream key", { roleId: role("Stream"), minutes: 5, warning: "Tell the producer before restarting; the countdown has to be re-rolled." });
  const noSignal = step("Start the YouTube event", {
    roleId: role("Stream"),
    minutes: 2,
    expected: "YouTube Studio shows **Receiving**.",
    branches: [{ condition: "YouTube Studio still shows No data after 60 seconds", target: fallback.key }],
  });
  await write(live.id, "Livestream Go-Live", "Everything to verify before the stream goes live at 8:55.", [
    p("Run this checklist 20 minutes before the service."),
    check("Encoder shows a stable bitrate above 6,000 kbps"),
    check("Stream key matches this week's YouTube event"),
    check("Broadcast mix on bus 15/16, peaking around −12 dBFS"),
    check("Countdown video loaded in ProPresenter"),
    check("Chat moderator is online"),
    h("Encoder settings"),
    code("Resolution: 1920x1080\nFrame rate: 29.97\nBitrate: 6000 kbps CBR\nKeyframe: 2 s\nAudio: AAC 48 kHz, 192 kbps", "text"),
    h("Going live"),
    noSignal,
    step("Roll the countdown at 8:55", { roleId: role("ProPresenter"), minutes: 5 }),
    step("Confirm audio on the stream", { roleId: role("Stream"), minutes: 2, description: "Listen on the confidence monitor with the 30-second delay. Don't trust the booth speakers for this." }),
    h("If the stream won't connect"),
    fallback,
    callout("danger", "**Never stop the encoder first.** End the event in YouTube Studio, then stop the encoder, or the recording breaks."),
  ]);
  await publishDraft(db, actor, live.id, { changeSummary: "First version." });

  // 4. Wireless mic battery swap (quick reference)
  const rfSop = await createSop(db, actor, {
    title: "Wireless Mic Frequencies & Batteries",
    folderId: rf.id,
    summary: "Coordinated frequencies, pack assignments and the battery rule.",
    tags: ["audio", "wireless", "batteries"],
    ownerId: maria.id,
  });
  await write(rfSop.id, "Wireless Mic Frequencies & Batteries", "Coordinated frequencies, pack assignments and the battery rule.", [
    callout("info", "Frequencies are coordinated for the sanctuary. Don't change them without updating this SOP."),
    table([
      ["Pack", "Name", "Frequency (MHz)", "Group / Ch"],
      ["1", "Pastor headset", "518.250", "1 / 01"],
      ["2", "Worship leader", "521.875", "1 / 02"],
      ["3", "Host handheld", "525.125", "1 / 03"],
      ["4", "Spare", "528.650", "1 / 04"],
    ]),
    h("Battery swap"),
    step("Fresh AA batteries in the pastor pack every service", { roleId: role("Audio"), minutes: 2, warning: "Even if the meter shows full." }),
    step("Check RF and battery on the receiver", { roleId: role("Audio"), minutes: 1, expected: "Every pack shows 5 bars and full battery." }),
    step("Put used batteries in the recycling tub", { minutes: 1 }),
  ]);
  await publishDraft(db, actor, rfSop.id, { changeSummary: "First version." });

  // Show the review schedule in action: one SOP overdue, one due soon.
  const daysFromNow = (d: number) => new Date(Date.now() + d * 864e5);
  await db.update(sops).set({ nextReviewAt: daysFromNow(-3) }).where(eq(sops.id, rfSop.id));
  await db.update(sops).set({ nextReviewAt: daysFromNow(10) }).where(eq(sops.id, live.id));

  // 5. A draft that has never been published.
  const fw = await createSop(db, actor, {
    title: "Firmware Updates & Config Backups",
    folderId: folder("Maintenance"),
    templateKey: "standard",
    summary: "How to update firmware without breaking Sunday.",
    tags: ["firmware", "maintenance"],
  });
  await write(fw.id, "Firmware Updates & Config Backups", "How to update firmware without breaking Sunday.", [
    callout("warning", "Firmware updates happen **Tuesday to Thursday only**. Never the week of a special service."),
    h("Procedure"),
    step("Back up the current config", { roleId: role("Technical"), minutes: 10, description: "Export the device config and attach it to the gear record." }),
    step("Record the firmware version", { minutes: 2 }),
    step("Update and test", { minutes: 30, expected: "Full signal test passes." }, [step("Apply the update"), step("Run a full signal test"), step("Note results in a task comment")]),
    divider(),
    p("Label every device with its asset tag, IP address and firmware version."),
  ]);
}
