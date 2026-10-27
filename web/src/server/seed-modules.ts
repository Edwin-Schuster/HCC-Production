import type { Executor } from "@/db";
import { workComments } from "@/db/schema";
import { addDays, today } from "@/lib/work";
import type { Actor } from "@/server/permissions";
import { createProject } from "@/server/services/projects";
import { createTask } from "@/server/services/tasks";

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
  return { sanctuary, youth };
}
