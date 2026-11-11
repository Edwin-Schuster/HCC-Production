# Design guide

The look and feel of HCC Production, for reuse in other apps.

**The style:** dark, calm and compact. Near-black backgrounds, white text, thin borders, and one bright button per screen. Colour only means status.

## Rules

1. **Dark by default**, with a light theme that swaps the same colour names.
2. **One primary button per screen.** Everything else is a plain or outline button.
3. **Colour means status only:** green = done, amber = needs attention, red = broken or destructive.
4. **Thin borders, no shadows** (except dialogs and menus, which float).
5. **Small, tidy text:** 13–14px, headings medium weight, sentence case.
6. **Works on a phone first:** a bottom tab bar, and dialogs that slide up from the bottom.
7. **Buttons say what happens:** "Create draft", "Import 8 cables", "Delete forever".

## Colours

Copy this into your CSS. Use the names, never raw hex codes in components.

```css
:root {
  --bg: #08090a;        /* page */
  --surface: #0f1011;   /* cards */
  --surface-2: #161718; /* dialogs, menus */
  --fg-hi: #ffffff;     /* headings, important text */
  --fg-2: #d0d6e0;      /* body text */
  --muted: #8a8f98;     /* labels, secondary text */
  --faint: #62666d;     /* hints, placeholders */
  --line: #23252a;      /* borders */
  --wash: rgb(255 255 255 / 0.05); /* hover and selected fill */
  --cta: #d9dce1;       /* primary button */
  --cta-ink: #08090a;   /* text on primary button */
  --accent: #a5a7fa;    /* current item, links */
  --good: #4cc26a;
  --warn: #f2a65a;
  --bad: #f07f7f;
}

[data-theme="light"] {
  --bg: #fbfbfc;
  --surface: #ffffff;
  --surface-2: #f4f5f7;
  --fg-hi: #08090a;
  --fg-2: #33363c;
  --muted: #6b6f76;
  --faint: #9a9ea6;
  --line: #e4e5e9;
  --wash: rgb(0 0 0 / 0.04);
  --cta: #23252a;
  --cta-ink: #ffffff;
  --accent: #4f46e5;
  --good: #1f8a3c;
  --warn: #b45309;
  --bad: #c53030;
}
```

For a soft status background, use the status colour at about 14% opacity behind status-coloured text.

## Text

- **Font:** Inter (or Avenir Next if installed). JetBrains Mono for IDs, codes and numbers in tables.
- **Sizes:** page title 24px · section title 15px · body 14px · buttons and tables 13px · labels and hints 12px.
- **Weight:** headings 500–510, everything else regular.
- **Colour steps:** `fg-hi` → `fg-2` → `muted` → `faint`. To make something quieter, step down; don't invent a new grey.

## Shape and spacing

- **Spacing:** multiples of 4px (8, 12, 16, 24, 32).
- **Corners:** cards and dialogs 12px · buttons and inputs 6px · badges 4px.
- **Heights:** buttons 32px · inputs 36px · sidebar rows 30px.

## Components

| Component | How it looks |
| --- | --- |
| **Primary button** | `cta` background, `cta-ink` text, 6px corners |
| **Other buttons** | Transparent with a `line` border (or none), `wash` on hover |
| **Delete button** | Red text on a soft red background |
| **Input** | 36px tall, faint fill, thin border, label above in 12px `muted` |
| **Card** | `surface` background, 1px `line` border, 12px corners, 16px padding |
| **Badge** | 12px text, 4px corners, soft status background |
| **Table** | Inside a card. 12px `muted` headers, row hover `wash`, IDs in mono |
| **Dialog** | `surface-2`, title at top, buttons bottom-right (Cancel, then the primary). Slides up from the bottom on phones |
| **Empty state** | Dashed border box: what's missing, and one sentence on how to start |
| **Toast** | Short, past tense: "Saved", "Cable added" |

## Layout

- **Desktop:** fixed 232px sidebar on the left; content centred, at most 960px wide (1200px for tables).
- **Phone:** sidebar becomes a slide-out menu, with a bottom tab bar for the main 4–5 sections.
- **Sidebar:** groups of links separated by thin lines. The current page gets a `wash` background and a small bar on its left.

## Behaviour

- **Hover:** a light wash, no colour changes or movement.
- **Keyboard focus:** a visible 1px outline.
- **While saving:** disable the button and change its text ("Saving…").
- **Deleting:** confirm in a dialog that says what will be lost. For permanent deletes, make people type the name first.

## Writing

- Plain words, sentence case, no exclamation marks.
- Errors say how to fix it: "Paste a Google Sheets link", not "Invalid input".
- Be specific: "8 new, 2 updated", not "Import complete".

## With an AI coding assistant

Save this as `DESIGN.md` in the new project, and add this line to its `CLAUDE.md`:

> Follow DESIGN.md for all UI: use its colour names, text sizes, components and writing rules. Every screen must work in dark and light themes and at phone width.
