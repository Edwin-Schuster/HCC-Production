---
title: SOP Markdown Format Guide
summary: How to write an SOP in Markdown so it imports with its steps, details, callouts and images intact.
tags: import, guide
---

This file is an example as well as a guide: import it (**All SOPs → Import**) to see every feature below turn into a real SOP. Lines between the `---` at the top set the title, summary and tags. Add `folder: Audio` (a folder's name or code, like `AUD`) to pick its folder.

> [!NOTE]
> To include images, put this Markdown file and its images in one **.zip** file and import the zip. Images can sit next to the file or in a folder such as `images/`.

## Steps

1. Write each step as a numbered list item
   - role: Technical Director
   - time: 2 min
   - expected: The step shows its role, time and expected result.

   Indent paragraphs under a step by three spaces to make them the step's description. Description text keeps **bold** and `code`.

2. Add step details as indented lines under the step
   - time: 1 min
   - warning: A "warning" line becomes the step's own warning.

   The dash is optional. The details are `role`, `time` (like `5 min`, `1h 30m` or `1:30`), `expected`, `warning` and `if`. A role must match a role on the Roster.

3. Nest sub-steps by indenting a numbered list
   1. Sub-steps are numbered 3.1, 3.2 and so on
      - time: 1 min
   2. Sub-steps can have their own details and sub-steps

4. Send people to another step when something goes wrong
   - if: The projector doesn't turn on -> 6

   An `if` line becomes a "go to step" rule. Write the condition, then `->` and the step number.

5. Add images to a step by indenting them under it

   ![The caption goes in the brackets](images/example.png "width=480")

   In the quotes, `width=480` sets how wide the image appears, in pixels. Leave it out for full width.

6. Restart the steps
   - expected: The next list starts again at 1.

## A second list of steps

1. A numbered list that starts at 1 again restarts the numbering
2. A list that starts at another number, like 3, carries on instead

## Callouts

> [!WARNING]
> A quote that starts with [!WARNING] or [!CAUTION] becomes a yellow warning box.

> [!DANGER]
> [!DANGER] makes a red danger box. [!NOTE] and [!TIP] make blue note boxes.

Warning: A paragraph that starts with "Warning:", "Danger:" or "Note:" works too.

## Everything else

- [ ] `- [ ]` makes a checklist item
- Plain bullets stay as bullet lines

| Tables | Stay as tables |
| --- | --- |
| Headings | `##` and `###` become section headings |

---

A line of three dashes on its own makes a divider.
