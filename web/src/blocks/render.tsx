import { AlertTriangle, CheckCircle2, Clock, CornerDownRight, ExternalLink, Info, OctagonAlert, Puzzle, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";
import { rt } from "./build";
import type { BlockNode, InlineRun, RichText } from "./schema";
import { formatMinutes, numberSteps, walk } from "./tree";
import { videoEmbedUrl } from "./media";

/**
 * The one renderer for SOP content. Used by the reading view, the editor preview and the PDF,
 * so they always match. Pure (no hooks) so it runs in Server and Client Components.
 */

/** Keyed by the snippet reference block's id. */
export type SnippetInfo = { name: string; version: number; pinned: boolean };
type StepNode = Extract<BlockNode, { type: "step" }>;

/** Lets a page attach controls (feedback, comments, run checkboxes) to steps without forking the renderer. */
export type StepSlots = {
  /** Replaces the number badge, e.g. with a run checkbox. */
  badge?: (step: StepNode, number: string) => ReactNode;
  /** Rendered at the end of the step's header row. */
  actions?: (step: StepNode, number: string) => ReactNode;
  /** Rendered under the step's fields. */
  footer?: (step: StepNode, number: string) => ReactNode;
};

export type RenderContext = {
  numbers: Map<string, string>;
  /** Step numbers by block key, for branch targets. */
  keyNumbers: Map<string, string>;
  roles: Record<string, string>;
  snippets: Record<string, SnippetInfo>;
  slots: StepSlots;
  print?: boolean;
};

export function Inline({ text }: { text: RichText }) {
  return (
    <>
      {text.map((r, i) => (
        <Run key={i} run={r} />
      ))}
    </>
  );
}

function Run({ run }: { run: InlineRun }) {
  let el: ReactNode = run.text;
  if (run.code) el = <code className="rounded-[4px] border border-line bg-wash px-1 py-px font-mono text-[0.86em] text-fg-hi">{el}</code>;
  if (run.bold) el = <strong className="font-[510] text-fg-hi">{el}</strong>;
  if (run.italic) el = <em>{el}</em>;
  if (run.underline) el = <span className="underline underline-offset-2">{el}</span>;
  if (run.strike) el = <s>{el}</s>;
  if (run.href) {
    const external = /^https?:/i.test(run.href);
    el = (
      <a href={run.href} className="text-fg-hi underline decoration-line-2 underline-offset-2 hover:decoration-fg-2" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {el}
      </a>
    );
  }
  return <>{el}</>;
}

/** Step fields are plain text where people type **bold** and `code`; paragraphs split on blank lines. */
function Prose({ text, className }: { text: string; className?: string }) {
  const paras = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <div className={cn("space-y-2", className)}>
      {paras.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          <Inline text={rt(p)} />
        </p>
      ))}
    </div>
  );
}

export function SopBody({
  blocks,
  roles = {},
  snippets = {},
  slots = {},
  print = false,
  className,
}: {
  blocks: BlockNode[];
  roles?: Record<string, string>;
  snippets?: Record<string, SnippetInfo>;
  slots?: StepSlots;
  print?: boolean;
  className?: string;
}) {
  const numbers = numberSteps(blocks);
  const keyNumbers = new Map<string, string>();
  for (const { node } of walk(blocks)) if (node.type === "step" && numbers.has(node.id)) keyNumbers.set(node.key, numbers.get(node.id)!);
  const ctx: RenderContext = { numbers, keyNumbers, roles, snippets, slots, print };
  return <div className={cn("sop-body text-[15px] leading-[1.65] text-fg-2", className)}>{renderList(blocks, ctx, 0)}</div>;
}

/** Renders siblings, grouping adjacent checklist items into one list. */
function renderList(nodes: BlockNode[], ctx: RenderContext, depth: number): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type === "checklist") {
      const group: BlockNode[] = [];
      while (i < nodes.length && nodes[i].type === "checklist") group.push(nodes[i++]);
      i--;
      out.push(
        <ul key={group[0].id} className="my-4 space-y-1.5" role="list">
          {group.map((c) => (
            <ChecklistItem key={c.id} node={c as Extract<BlockNode, { type: "checklist" }>} ctx={ctx} depth={depth} />
          ))}
        </ul>,
      );
      continue;
    }
    out.push(<Block key={n.id} node={n} ctx={ctx} depth={depth} />);
  }
  return out;
}

function Children({ node, ctx, depth }: { node: BlockNode; ctx: RenderContext; depth: number }) {
  if (!node.children.length) return null;
  return <div className="mt-3 border-l border-line pl-4 sm:pl-5">{renderList(node.children, ctx, depth + 1)}</div>;
}

function Block({ node, ctx, depth }: { node: BlockNode; ctx: RenderContext; depth: number }) {
  const anchor = `b-${node.id}`;
  switch (node.type) {
    case "heading": {
      const L = node.content.level;
      const cls = L === 1 ? "mt-12 text-2xl" : L === 2 ? "mt-10 text-xl" : "mt-8 text-base";
      const Tag = (`h${L + 1}` as "h2" | "h3" | "h4");
      return (
        <>
          <Tag id={anchor} className={cn("scroll-mt-24 break-after-avoid font-[510] leading-snug tracking-[-0.012em] text-fg-hi first:mt-0", cls)}>
            <Inline text={node.content.text} />
          </Tag>
          <Children node={node} ctx={ctx} depth={depth} />
        </>
      );
    }
    case "text":
      return (
        <div className="my-3">
          <p className="whitespace-pre-line">
            <Inline text={node.content.text} />
          </p>
          <Children node={node} ctx={ctx} depth={depth} />
        </div>
      );
    case "step":
      return <Step node={node} ctx={ctx} depth={depth} />;
    case "callout":
      return <Callout node={node} ctx={ctx} depth={depth} />;
    case "code":
      return (
        <div className="my-4 break-inside-avoid overflow-hidden rounded-[6px] border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line py-1 pl-3 pr-1 font-mono text-[11px] text-muted">
            <span>{node.content.language || "text"}</span>
            {!ctx.print && <CopyButton text={node.content.code} />}
          </div>
          <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-[1.7] text-fg-2 print:whitespace-pre-wrap">
            <code>{node.content.code}</code>
          </pre>
        </div>
      );
    case "table": {
      const [head, ...body] = node.content.headerRow ? node.content.rows : [undefined, ...node.content.rows];
      return (
        <div className="my-4 overflow-x-auto rounded-[6px] border border-line">
          <table className="w-full border-collapse text-[13.5px]">
            {head && (
              <thead>
                <tr className="bg-surface">
                  {head.map((c, i) => (
                    <th key={i} className="border-b border-line px-3 py-2 text-left font-[510] text-fg-hi">
                      <Inline text={c} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className="break-inside-avoid border-b border-line last:border-0">
                  {row!.map((c, i) => (
                    <td key={i} className="px-3 py-2 align-top">
                      <Inline text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "image":
      return (
        <figure className="my-5 break-inside-avoid">
          {/* eslint-disable-next-line @next/next/no-img-element -- user uploads and data URIs; sized by the author */}
          <img
            src={node.content.url}
            alt={node.content.caption}
            loading="lazy"
            style={node.content.width ? { width: node.content.width, maxWidth: "100%" } : undefined}
            className="block max-w-full rounded-[12px] border border-line bg-surface"
          />
          {node.content.caption && <figcaption className="mt-2 text-center text-[12.5px] text-muted">{node.content.caption}</figcaption>}
        </figure>
      );
    case "video": {
      const embedUrl = videoEmbedUrl(node.content.url);
      return (
        <figure className="my-5 break-inside-avoid">
          {ctx.print ? (
            <MediaLink url={node.content.url} label="Video" />
          ) : embedUrl ? (
            <div className="relative aspect-video overflow-hidden rounded-[12px] border border-line bg-surface">
              <iframe src={embedUrl} title={node.content.caption || "Video"} className="absolute inset-0 size-full" allow="encrypted-media; picture-in-picture; fullscreen" loading="lazy" />
            </div>
          ) : (
            <video src={node.content.url} controls preload="metadata" className="block w-full rounded-[12px] border border-line bg-black" />
          )}
          {node.content.caption && <figcaption className="mt-2 text-center text-[12.5px] text-muted">{node.content.caption}</figcaption>}
        </figure>
      );
    }
    case "embed":
      return (
        <figure className="my-5 break-inside-avoid">
          {ctx.print ? (
            <MediaLink url={node.content.url} label={node.content.title || "Embedded page"} />
          ) : (
            <iframe
              src={node.content.url}
              title={node.content.title || "Embedded page"}
              style={{ height: node.content.height }}
              className="block w-full rounded-[12px] border border-line bg-surface"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          )}
          {node.content.title && !ctx.print && <figcaption className="mt-2 text-center text-[12.5px] text-muted">{node.content.title}</figcaption>}
        </figure>
      );
    case "snippet_ref": {
      const info = ctx.snippets[node.id];
      if (!info || !node.children.length)
        return <div className="my-4 rounded-[6px] border border-dashed border-line px-4 py-3 text-[13px] text-muted">This shared snippet is no longer available.</div>;
      return (
        <div className="sop-snippet my-5" data-snippet={node.content.snippetId}>
          {!ctx.print && (
            <div className="mb-1 flex items-center gap-1.5 text-[11px] text-faint" title={info.pinned ? `Pinned to version ${info.version}` : "Shared snippet. Updates here when the snippet changes."}>
              <Puzzle className="size-3" aria-hidden /> {info.name}
              {info.pinned && <span className="font-mono">· v{info.version}</span>}
            </div>
          )}
          {renderList(node.children, ctx, depth)}
        </div>
      );
    }
    case "divider":
      return <hr className="my-8 border-0 border-t border-line" />;
    case "checklist":
      return null; // rendered by renderList
  }
}

function ChecklistItem({ node, ctx, depth }: { node: Extract<BlockNode, { type: "checklist" }>; ctx: RenderContext; depth: number }) {
  return (
    <li id={`b-${node.id}`} className="scroll-mt-24 break-inside-avoid">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={cn("mt-[5px] grid size-4 shrink-0 place-items-center rounded-[4px] border", node.content.checked ? "border-iris bg-iris text-white" : "border-line-2")}
        >
          {node.content.checked && <CheckCircle2 className="size-3" strokeWidth={3} />}
        </span>
        <span className={cn(node.content.checked && "text-muted line-through")}>
          <Inline text={node.content.text} />
        </span>
      </div>
      <Children node={node} ctx={ctx} depth={depth} />
    </li>
  );
}

const CALLOUT = {
  info: { icon: Info, label: "Note", color: "var(--teal)" },
  warning: { icon: AlertTriangle, label: "Warning", color: "var(--warn)" },
  danger: { icon: OctagonAlert, label: "Danger", color: "var(--urgent)" },
} as const;

function Callout({ node, ctx, depth }: { node: Extract<BlockNode, { type: "callout" }>; ctx: RenderContext; depth: number }) {
  const c = CALLOUT[node.content.variant];
  const Icon = c.icon;
  return (
    <aside
      role={node.content.variant === "info" ? "note" : "alert"}
      className="my-5 flex break-inside-avoid gap-3 rounded-[6px] border border-line border-l-2 px-4 py-3"
      style={{ borderLeftColor: c.color, background: `color-mix(in srgb, ${c.color} 7%, var(--surface))` }}
    >
      <Icon className="mt-[3px] size-4 shrink-0" style={{ color: c.color }} aria-label={c.label} />
      <div className="min-w-0 flex-1 text-[14.5px]">
        <p className="whitespace-pre-line">
          <Inline text={node.content.text} />
        </p>
        <Children node={node} ctx={ctx} depth={depth} />
      </div>
    </aside>
  );
}

function MediaLink({ url, label }: { url: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[6px] border border-line px-3 py-2 text-[13px]">
      <ExternalLink className="size-3.5 shrink-0 text-muted" aria-hidden />
      <span className="font-[510] text-fg-hi">{label}:</span>
      <span className="truncate font-mono text-[12px] text-fg-2">{url}</span>
    </div>
  );
}

function Step({ node, ctx, depth }: { node: StepNode; ctx: RenderContext; depth: number }) {
  const s = node.content;
  const num = ctx.numbers.get(node.id) ?? "";
  const role = s.roleId ? ctx.roles[s.roleId] : undefined;
  const top = depth === 0;
  return (
    <section id={`b-${node.id}`} data-key={node.key} className={cn("sop-step group/step scroll-mt-24", top ? "my-6" : "my-4")} aria-label={`Step ${num}`}>
      <span id={`k-${node.key}`} className="block scroll-mt-24" aria-hidden />
      <div className="flex break-inside-avoid gap-3.5">
        {ctx.slots.badge?.(node, num) ?? (
          <span
            className={cn(
              "sop-step-num mt-[1px] flex h-[26px] shrink-0 items-center justify-center rounded-full border font-mono text-xs tabular-nums",
              top ? "min-w-[26px] border-line-2 bg-surface-2 px-1.5 text-fg-hi" : "min-w-[26px] border-line bg-transparent px-2 text-fg-2",
            )}
          >
            {num}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-start gap-2">
            <h3 className={cn("min-w-0 flex-1 font-[510] leading-[26px] tracking-[-0.011em] text-fg-hi", top ? "text-[15.5px]" : "text-[15px]")}>
              {s.title.length ? <Inline text={s.title} /> : <span className="text-faint">Untitled step</span>}
            </h3>
            {!ctx.print && ctx.slots.actions?.(node, num)}
          </div>
          {(role || s.estDuration) && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {role && (
                <span className="inline-flex items-center gap-1 rounded-[4px] bg-wash px-1.5 leading-[20px] text-fg-2">
                  <UserRound className="size-3 text-muted" aria-hidden /> {role}
                </span>
              )}
              {s.estDuration ? (
                <span className="inline-flex items-center gap-1 rounded-[4px] bg-wash px-1.5 font-mono leading-[20px] text-fg-2">
                  <Clock className="size-3 text-muted" aria-hidden /> {formatMinutes(s.estDuration)}
                </span>
              ) : null}
            </div>
          )}
          {s.description && <Prose text={s.description} />}
          {s.warning && (
            <div className="flex gap-2 rounded-[6px] border border-line border-l-2 border-l-warn bg-warn-soft/40 px-3 py-2 text-[14px]" role="alert">
              <AlertTriangle className="mt-[3px] size-3.5 shrink-0 text-warn" aria-label="Warning" />
              <Prose text={s.warning} />
            </div>
          )}
          {s.expectedResult && (
            <div className="flex gap-2 rounded-[6px] border border-line px-3 py-2 text-[14px]">
              <CheckCircle2 className="mt-[3px] size-3.5 shrink-0 text-good" aria-hidden />
              <div className="min-w-0">
                <span className="text-xs font-[510] text-muted">Expected result</span>
                <Prose text={s.expectedResult} />
              </div>
            </div>
          )}
          {s.branches.length > 0 && (
            <ul className="space-y-1 text-[14px]" role="list" aria-label="Branches">
              {s.branches.map((b, i) => {
                const target = ctx.keyNumbers.get(b.target);
                return (
                  <li key={i} className="flex items-start gap-2">
                    <CornerDownRight className="mt-[4px] size-3.5 shrink-0 text-muted" aria-hidden />
                    <span>
                      <span className="text-muted">If</span> {b.condition}{" "}
                      <span className="text-muted">→</span>{" "}
                      {target ? (
                        ctx.print ? (
                          <span className="font-[510] text-fg-hi">go to step {target}</span>
                        ) : (
                          <a href={`#k-${b.target}`} className="font-[510] text-fg-hi underline decoration-line-2 underline-offset-2">
                            go to step {target}
                          </a>
                        )
                      ) : (
                        <span className="text-faint">a step that was removed</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {!ctx.print && ctx.slots.footer?.(node, num)}
        </div>
      </div>
      {node.children.length > 0 && <div className="ml-[13px] mt-3 border-l border-line pl-[22px]">{renderList(node.children, ctx, depth + 1)}</div>}
    </section>
  );
}
