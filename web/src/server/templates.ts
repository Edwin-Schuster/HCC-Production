import { callout, check, code, divider, h, p, step, table } from "@/blocks/build";
import type { BlockNode } from "@/blocks/schema";

export type TemplateDef = { key: string; name: string; description: string; build: () => BlockNode[] };

/** Built-in templates. Seeded into every workspace; new SOPs copy the blocks with fresh ids. */
export const BUILT_IN_TEMPLATES: TemplateDef[] = [
  {
    key: "standard",
    name: "Standard SOP",
    description: "Purpose, scope, prerequisites, numbered procedure and verification.",
    build: () => [
      h("Purpose"),
      p("Why this procedure exists and what it protects against."),
      h("Scope"),
      p("Who follows this procedure and when. What is out of scope."),
      h("Before you start"),
      check("Required access or keys"),
      check("Equipment and tools ready"),
      h("Procedure"),
      step("First step", { description: "Describe exactly what to do.", expected: "What you should see when it worked." }),
      step("Second step", { description: "Describe exactly what to do." }),
      step("Third step", { description: "Describe exactly what to do." }),
      h("Verification"),
      p("How to confirm the whole procedure succeeded."),
      callout("info", "Questions about this SOP go to its owner listed above."),
    ],
  },
  {
    key: "checklist",
    name: "Checklist only",
    description: "A plain list of items to tick off. Best for pre-service and shutdown checks.",
    build: () => [p("Work through every item before you sign off."), check("First item"), check("Second item"), check("Third item"), check("Fourth item")],
  },
  {
    key: "quick-reference",
    name: "Quick Reference Card",
    description: "One screen of key facts: settings, contacts and the few steps people forget.",
    build: () => [
      callout("info", "Keep this card short enough to read in 30 seconds."),
      h("Key settings"),
      table([
        ["Setting", "Value"],
        ["", ""],
        ["", ""],
      ]),
      h("Do this"),
      step("Most important action"),
      step("Second most important action"),
      h("Contacts"),
      table([
        ["Role", "Name", "Phone"],
        ["", "", ""],
      ]),
    ],
  },
  {
    key: "training",
    name: "Training Guide",
    description: "Teach a new volunteer a task, with learning goals and practice.",
    build: () => [
      h("What you will learn"),
      check("Goal one"),
      check("Goal two"),
      h("Background"),
      p("Explain the system and why it works the way it does. Add photos or a short video."),
      h("Walkthrough"),
      step("Watch an experienced operator do it once", { minutes: 15 }),
      step("Do it yourself with a trainer beside you", { minutes: 20 }, [step("Part one"), step("Part two")]),
      step("Do it alone and have the trainer check the result", { minutes: 15, expected: "The trainer signs off on the result." }),
      h("Common mistakes"),
      callout("warning", "Describe the mistake new volunteers make most often and how to avoid it."),
    ],
  },
  {
    key: "incident",
    name: "Incident Runbook",
    description: "What to do when something fails live: stabilize, diagnose, recover, report.",
    build: () => [
      callout("danger", "If the service is live, stabilize first. Diagnose after the audience is no longer affected."),
      h("Symptoms"),
      p("What people will see or hear when this incident happens."),
      h("Stabilize"),
      step("Switch to the backup", { minutes: 1, expected: "The audience no longer notices the problem.", warning: "Tell the director before you switch." }),
      h("Diagnose"),
      step("Check the most likely cause first"),
      step("Check the next most likely cause"),
      code("Commands or settings to check", "text"),
      h("Recover"),
      step("Return to the primary system"),
      divider(),
      h("After the incident"),
      check("Write down what happened and when"),
      check("Create a task for the permanent fix"),
    ],
  },
];
