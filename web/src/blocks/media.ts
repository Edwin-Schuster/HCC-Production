/** Turns a YouTube or Vimeo page link into its embeddable player URL. Other links play as plain video files. */
export function videoEmbedUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url, "https://x.invalid");
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return youtube(u.pathname.slice(1), u);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") return youtube(u.searchParams.get("v") ?? "", u);
    const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/);
    if (m) return youtube(m[1], u);
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(\d{6,})/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }
  return null;
}

function youtube(id: string, u: URL): string | null {
  if (!/^[\w-]{6,20}$/.test(id)) return null;
  const t = Number.parseInt(u.searchParams.get("t") ?? u.searchParams.get("start") ?? "", 10);
  return `https://www.youtube-nocookie.com/embed/${id}${t > 0 ? `?start=${t}` : ""}`;
}
