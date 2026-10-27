"use client";

import dynamic from "next/dynamic";
import type { EditorProps } from "./sop-editor";
import type { SnippetEditorProps } from "./snippet-editor";

/** BlockNote needs the DOM, so the editor only renders in the browser. */
const SopEditor = dynamic(() => import("./sop-editor"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-[860px] px-6 pt-20" aria-busy>
      <div className="h-9 w-2/3 rounded bg-wash" />
      <div className="mt-4 h-4 w-1/2 rounded bg-wash-2" />
      <div className="mt-10 grid gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="size-6 rounded-full bg-wash" />
            <div className="h-4 flex-1 rounded bg-wash-2" />
          </div>
        ))}
      </div>
    </div>
  ),
});

export function EditorLoader(props: EditorProps) {
  return <SopEditor {...props} />;
}

const SnippetEditor = dynamic(() => import("./snippet-editor"), { ssr: false, loading: () => <div className="h-96" aria-busy /> });

export function SnippetEditorLoader(props: SnippetEditorProps) {
  return <SnippetEditor {...props} />;
}
