import { Fragment } from "react";

const START = "⁣[[";
const END = "]]⁣";

/** Renders ts_headline output: matched words become <mark>. Text is never parsed as HTML. */
export function Highlighted({ text }: { text: string }) {
  const parts: { t: string; hl: boolean }[] = [];
  let rest = text;
  while (rest) {
    const s = rest.indexOf(START);
    if (s < 0) {
      parts.push({ t: rest, hl: false });
      break;
    }
    if (s > 0) parts.push({ t: rest.slice(0, s), hl: false });
    const e = rest.indexOf(END, s);
    if (e < 0) {
      parts.push({ t: rest.slice(s + START.length), hl: true });
      break;
    }
    parts.push({ t: rest.slice(s + START.length, e), hl: true });
    rest = rest.slice(e + END.length);
  }
  return (
    <>
      {parts.map((p, i) =>
        p.hl ? (
          <mark key={i} className="rounded-[2px] bg-iris/25 px-0.5 text-fg-hi">
            {p.t}
          </mark>
        ) : (
          <Fragment key={i}>{p.t}</Fragment>
        ),
      )}
    </>
  );
}
