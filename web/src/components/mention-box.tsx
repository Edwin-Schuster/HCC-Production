"use client";

import { useRef } from "react";
import { Textarea } from "@/components/ui/field";

export type Mentionable = { username: string; name: string };

/** A textarea with @mention autocomplete. Cmd/Ctrl+Enter submits. */
export function MentionBox({
  members,
  value,
  onChange,
  onSubmit,
  placeholder,
  rows = 3,
  autoFocus,
}: {
  members: Mentionable[];
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const query = value.match(/(?:^|\s)@([a-z0-9._-]*)$/i)?.[1]?.toLowerCase();
  const matches = query !== undefined ? members.filter((m) => m.username.toLowerCase().startsWith(query) || m.name.toLowerCase().includes(query)).slice(0, 5) : [];
  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && value.trim()) {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        rows={rows}
        maxLength={5000}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {matches.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-[6px] border border-line bg-surface-3 shadow-lg" role="listbox">
          {matches.map((m) => (
            <li key={m.username}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-wash"
                onClick={() => {
                  onChange(value.replace(/@([a-z0-9._-]*)$/i, `@${m.username} `));
                  ref.current?.focus();
                }}
              >
                <span className="text-fg-hi">{m.name}</span>
                <span className="font-mono text-xs text-muted">@{m.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Comment text with @mentions in bold. */
export function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@[a-z0-9._-]{2,40})/gi);
  return (
    <p className="whitespace-pre-line break-words text-[13.5px] text-fg-2">
      {parts.map((p, i) => (p.startsWith("@") ? <b key={i} className="font-[510] text-fg-hi">{p}</b> : p))}
    </p>
  );
}
