import { Marked, type Tokens } from "marked";

/**
 * Markdown for descriptions, comments and scopes of work. Raw HTML is shown as text, and links and
 * images may only point at http(s), mailto, tel or this app, so the output is safe to insert.
 */
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeUrl = (href: string) => (/^(https?:|mailto:|tel:|\/(?!\/)|#)/i.test(href.trim()) ? href.trim() : null);

const md = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escape(text),
    link({ href, title, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens);
      const url = safeUrl(href);
      if (!url) return text;
      const external = /^https?:/i.test(url);
      return `<a href="${escape(url)}"${title ? ` title="${escape(title)}"` : ""}${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
    },
    image({ href, title, text }: Tokens.Image) {
      const url = safeUrl(href);
      if (!url) return escape(text);
      return `<img src="${escape(url)}" alt="${escape(text)}"${title ? ` title="${escape(title)}"` : ""} loading="lazy">`;
    },
  },
});

export function renderMarkdown(source: string): string {
  return md.parse(source ?? "") as string;
}
