/**
 * "studio.youtube.com/*" style patterns for the browser extension. The scheme is ignored, * matches anything,
 * and a pattern without a path matches the whole site.
 */
export function urlMatches(pattern: string, url: string): boolean {
  const strip = (s: string) => s.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  let p = strip(pattern);
  if (!p) return false;
  if (!p.includes("/")) p += "/*";
  const re = new RegExp(`^${p.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  return re.test(strip(url));
}
