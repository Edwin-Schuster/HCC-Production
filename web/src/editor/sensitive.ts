/**
 * Finds text in a screenshot that looks like a secret, so the annotation editor can blur it by default.
 * Input is OCR output (words with pixel boxes, grouped into lines); output is boxes to blur.
 */

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type OcrWord = { text: string; bbox: Box };
export type OcrLine = { words: OcrWord[] };

/** Labels whose value (the rest of the line) should be hidden. */
const LABEL = /^(password|passwd|passcode|pass|pwd|pin|secret|token|api[-_ ]?key|key|account|acct|routing|aba|ssn|iban|swift|card|cvv|cvc)\s*(no\.?|number|#)?[:#=]?$/i;
/** "number" in "Account number:". */
const SUFFIX = /^(no\.?|number|#)[:#=]?$/i;
/** Masked input (••••••, ******). */
const MASKED = /^[•●*·∙⋅◦]{3,}$/;

/** Has digits or symbols, or is a long unbroken token: "hunter2", "s3cr3t!", "AKIAIOSFODNN7EXAMPLE". */
const looksSecret = (s: string) => /\d/.test(s) || /[^\p{L}\s]/u.test(s.replace(/[.,;]$/, "")) || s.length >= 16;
const digits = (s: string) => s.replace(/[\s\-–.]/g, "");
const isNumberish = (s: string) => /^[\d\s\-–.]+$/.test(s) && /\d/.test(s);

function union(a: Box, b: Box): Box {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

export function findSensitive(lines: OcrLine[], pad = 4): Box[] {
  const hits: Box[] = [];
  for (const line of lines) {
    const words = line.words.filter((w) => w.text.trim());
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const text = w.text.trim();
      if (MASKED.test(text)) hits.push(w.bbox);
      // "Password:" or "Account number:" → hide what follows on the same line (up to four words).
      if (LABEL.test(text)) {
        const suffix = SUFFIX.test(words[i + 1]?.text.trim() ?? "");
        const start = suffix ? i + 2 : i + 1;
        const rest = words.slice(start, start + 4);
        // "Password: x" is explicit. Without a colon ("Stream key settings") only hide values that look secret.
        const explicit = /[:#=]$/.test(suffix ? words[i + 1].text.trim() : text);
        if (rest.length && (explicit || looksSecret(rest[0].text))) hits.push(rest.map((r) => r.bbox).reduce(union));
      }
    }
    // Runs of digits (card, account and routing numbers), joined across spaces: 4111 1111 1111 1111.
    let run: OcrWord[] = [];
    const flush = () => {
      if (run.length && digits(run.map((r) => r.text).join("")).replace(/\D/g, "").length >= 6) hits.push(run.map((r) => r.bbox).reduce(union));
      run = [];
    };
    for (const w of words) {
      if (isNumberish(w.text.trim())) run.push(w);
      else flush();
    }
    flush();
  }
  // Pad and merge overlapping boxes.
  const padded = hits.map((b) => ({ x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }));
  const merged: Box[] = [];
  for (const b of padded) {
    const hit = merged.findIndex((m) => b.x0 <= m.x1 && b.x1 >= m.x0 && b.y0 <= m.y1 && b.y1 >= m.y0);
    if (hit >= 0) merged[hit] = union(merged[hit], b);
    else merged.push(b);
  }
  return merged;
}
