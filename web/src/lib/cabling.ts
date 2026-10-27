/** Cabling and room-layout vocabulary, shared by the server and the browser. */

export const CABLE_TYPES = ["Cat6", "Cat6A", "Fiber SM", "Fiber MM", "12G-SDI", "3G-SDI", "HDMI", "XLR", "Speaker 12/2", "Speaker 12/4", "DMX", "Power", "Other"] as const;

export const CABLE_STATUSES = ["planned", "pulled", "terminated", "tested", "labeled", "complete"] as const;
export type CableStatus = (typeof CABLE_STATUSES)[number];
export const CABLE_STATUS_LABEL: Record<CableStatus, string> = { planned: "Planned", pulled: "Pulled", terminated: "Terminated", tested: "Tested", labeled: "Labeled", complete: "Complete" };
/** Tested or further along: counts toward "cables tested" on the project overview. */
export const CABLE_VERIFIED: CableStatus[] = ["tested", "labeled", "complete"];

export const DEVICE_TYPES = {
  speaker: ["Speaker", "S"],
  camera: ["Camera", "C"],
  rack: ["Rack", "R"],
  stagebox: ["Stage box", "B"],
  display: ["Display", "D"],
  projector: ["Projector", "P"],
  mic: ["Mic / input", "M"],
  light: ["Light", "L"],
  wap: ["Wireless AP", "W"],
  floorbox: ["Floor box", "F"],
  jack: ["Wall plate", "J"],
  zone: ["Room / zone", "▭"],
} as const satisfies Record<string, readonly [string, string]>;
export type DeviceType = keyof typeof DEVICE_TYPES;
export const DEVICE_TYPE_KEYS = Object.keys(DEVICE_TYPES) as DeviceType[];
