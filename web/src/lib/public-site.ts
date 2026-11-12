/** Public site vocabulary and starting content, shared by the server and the browser. */

export const GEAR_GROUPS = [
  ["audio", "Audio"],
  ["video", "Video"],
  ["lighting", "Lighting"],
  ["stage", "Stage & power"],
] as const;
export type GearGroup = (typeof GEAR_GROUPS)[number][0];
export const GEAR_GROUP_LABEL = Object.fromEntries(GEAR_GROUPS) as Record<GearGroup, string>;
export const isGearGroup = (g: string): g is GearGroup => GEAR_GROUPS.some(([k]) => k === g);

/** A sensible public group for a gear item from its internal category. */
export function groupFor(category: string): GearGroup {
  const c = category.toLowerCase();
  if (/light|dmx|fixture|dimmer/.test(c)) return "lighting";
  if (/video|camera|display|projector|switcher|stream|graphics|led wall/.test(c)) return "video";
  if (/audio|sound|mic|speaker|console|amp|monitor|iem|dante/.test(c)) return "audio";
  return "stage";
}

export const DEFAULT_HERO_TITLE = "HCC Production";
export const DEFAULT_HERO_INTRO =
  "We're the production team at Hope Christian Church. We run **sound, video, livestream, lighting and event support** for Hope's Sunday services, ministries and events, from the Worship Center to the smallest classroom.";

export const DEFAULT_SERVICES: [title: string, body: string][] = [
  ["Sunday services", "Mixing, lyrics and slides, cameras and lighting for every weekend service in the Worship Center."],
  ["Livestream & recording", "Multi-camera livestreams, recordings for on-demand viewing, and audio for podcasts."],
  ["Conferences", "Full production for conferences and multi-session events: presenters, video playback and breakout rooms."],
  ["Concerts", "Band and choir reinforcement, monitor mixes, stage lighting and recording."],
  ["Ministry events", "Support for youth nights, kids' programs, women's and men's events, and Celebrate Recovery."],
  ["Small events in other rooms", "Simple sound and screen setups for meetings, classes and gatherings in the Atrium, Greenroom and Rooms 1 and 2."],
];

export const DEFAULT_ROOMS = ["Worship Center", "Atrium", "Greenroom", "Room 1", "Room 2"];

export const DEFAULT_GUESTS_BODY = `## Slides and video

- **Slides:** 16:9, as PowerPoint, Keynote or PDF. Embedded fonts or PDF avoid surprises.
- **Video:** MP4 (H.264), 1920×1080, 30 fps, with stereo audio. Send a link, not an email attachment.
- **Music for walk-ins or videos:** MP3 or WAV.

## What we provide

- Front-of-house mixing, wireless handheld and headset mics
- Confidence monitor and a clicker for slides
- Lyrics and slides on the main screens
- Livestream and recording, when requested

## What to bring

- Your instruments and any in-ear packs you prefer
- A list of inputs (stage plot and input list for bands)
- Your slides and videos, sent ahead (see below)

## Advance checklist

1. Send slides and videos at least **3 days before** the event.
2. Send a stage plot and input list (bands).
3. Tell us how many mics you need and who will use them.
4. Confirm your arrival time with your event contact.

## Arrival

- Plan to arrive **90 minutes** before your start time for setup and a sound check.
- Load in through the doors your event contact gives you; parking is available near the building.
- Ask for the production team at the tech booth when you arrive.`;
