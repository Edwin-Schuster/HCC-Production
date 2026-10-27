import "server-only";
import type { Browser } from "playwright";

let browser: Promise<Browser> | null = null;
let active = 0;
const queue: (() => void)[] = [];
const MAX_CONCURRENT = 2;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = import("playwright").then(({ chromium }) =>
      chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] }),
    );
    browser.catch(() => (browser = null));
  }
  const b = await browser;
  if (!b.isConnected()) {
    browser = null;
    return getBrowser();
  }
  return b;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Renders the print page to PDF with Chromium, so the PDF uses the same HTML and CSS as the web view.
 * The caller's session cookie is forwarded, so the print page applies the same permissions.
 */
export async function renderPdf(opts: { url: string; cookies: { name: string; value: string }[]; header: string; footerLeft: string }): Promise<Buffer> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => queue.push(r));
  active++;
  const b = await getBrowser();
  const u = new URL(opts.url);
  const context = await b.newContext({ colorScheme: "light" });
  try {
    if (opts.cookies.length) await context.addCookies(opts.cookies.map((c) => ({ ...c, domain: u.hostname, path: "/" })));
    const page = await context.newPage();
    const res = await page.goto(opts.url, { waitUntil: "networkidle", timeout: 45_000 });
    if (!res || !res.ok()) throw new Error(`Print page returned ${res?.status()}`);
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    const small = "font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 8px; color: #6b6f76; width: 100%; padding: 0 14mm; display: flex; justify-content: space-between;";
    return await page.pdf({
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: true,
      margin: { top: "18mm", bottom: "16mm", left: "14mm", right: "14mm" },
      headerTemplate: `<div style="${small}"><span>${esc(opts.header)}</span><span>Hope Christian Church</span></div>`,
      footerTemplate: `<div style="${small}"><span>${esc(opts.footerLeft)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    });
  } finally {
    await context.close().catch(() => {});
    active--;
    queue.shift()?.();
  }
}
