/** Network-plan helpers shared by the server and the browser. */

export type PortLike = { id: string; switchName: string; port: string; vlan: string; ip: string; device: string };

/** IPs used by more than one port or device. Each IP lists the rows that share it. */
export function duplicateIps<T extends PortLike>(rows: T[]): Map<string, T[]> {
  const byIp = new Map<string, T[]>();
  for (const r of rows) {
    const ip = r.ip.trim();
    if (!ip) continue;
    byIp.set(ip, [...(byIp.get(ip) ?? []), r]);
  }
  return new Map([...byIp].filter(([, list]) => list.length > 1));
}

/** "10.0.19.15" is a valid IPv4 address; anything else that's filled in is flagged. */
export const isIpv4 = (ip: string) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(ip.trim());

/** Sorts "Port 2" before "Port 10". */
export const portOrder = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
