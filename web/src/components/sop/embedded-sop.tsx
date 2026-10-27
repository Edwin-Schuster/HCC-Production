import { SopBody } from "@/blocks/render";
import type { SopDocument } from "@/server/services/sops";
import { brandScope } from "@/server/services/branding";
import { EmbedFrame } from "./embed-frame";

/** The compact SOP view used inside other sites' pages. */
export function EmbeddedSop({ doc, href }: { doc: SopDocument; href: string }) {
  return (
    <EmbedFrame>
      <article className="px-5 py-5" {...brandScope(doc.branding)}>
        <header className="sop-header mb-5 border-b border-line pb-4">
          <p className="font-mono text-xs text-muted">
            {doc.sop.documentCode} · v{doc.version.number}
          </p>
          <h1 className="mt-1 text-[22px] font-[510] tracking-[-0.015em] text-fg-hi">{doc.version.title}</h1>
          {doc.version.summary && <p className="mt-1.5 text-[14px] text-muted">{doc.version.summary}</p>}
        </header>
        <SopBody blocks={doc.blocks} roles={doc.roles} snippets={doc.snippets} />
        <p className="mt-6 border-t border-line pt-3 text-xs text-faint">
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-fg-2">
            Open in HCC Production
          </a>
        </p>
      </article>
    </EmbedFrame>
  );
}

export function EmbedMessage({ children }: { children: string }) {
  return (
    <EmbedFrame>
      <p className="px-5 py-8 text-center text-[13px] text-muted">{children}</p>
    </EmbedFrame>
  );
}
