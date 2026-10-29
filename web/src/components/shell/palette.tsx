"use client";

import { Command } from "cmdk";
import { BarChart3, Box, CalendarClock, FolderKanban, GraduationCap, HardHat, Home, Inbox, ListTodo, Puzzle, ShoppingCart, Users, BookOpen, FilePlus2, FileText, Heading2, Image as ImageIcon, KeyRound, ListChecks, ListOrdered, Minus, MessageSquareWarning, Moon, Search, Send, Table, Terminal, Eye, CornerDownRight } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Highlighted } from "@/components/highlighted";
import { EDITOR_COMMAND, PALETTE_OPEN, sendEditorCommand, type EditorCommand } from "./palette-bus";

type Hit = { id: string; title: string; documentCode: string; hits: { blockId: string; label: string; snippet: string }[] };

/** ⌘K / Ctrl+K: jump to an SOP or matching step, run actions, and drive the editor. */
export function CommandPalette({ canCreate, signedIn }: { canCreate: boolean; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const inEditor = /^\/sops\/[^/]+\/edit$/.test(pathname);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener(PALETTE_OPEN, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener(PALETTE_OPEN, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?limit=8&q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (id === seq.current) setResults(j.results ?? []);
      } catch {
        if (id === seq.current) setResults([]);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, q ? 120 : 0);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQ("");
      router.push(href);
    },
    [router],
  );
  const editor = (cmd: EditorCommand) => {
    setOpen(false);
    // Let the dialog close and return focus before the editor acts.
    setTimeout(() => sendEditorCommand(cmd), 30);
  };

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-[12px] border border-line-2 bg-surface-2 shadow-lg focus:outline-none">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search SOPs and run commands</D.Description>
          <Command shouldFilter={false} loop className="flex max-h-[min(560px,70vh)] flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-4 text-muted" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder={inEditor ? "Search SOPs or type a command (step, callout, publish…)" : "Search SOPs and steps, or jump to a page…"}
                className="h-12 flex-1 bg-transparent text-[15px] text-fg-hi outline-none placeholder:text-faint"
              />
              {loading && <span className="font-mono text-[11px] text-faint">…</span>}
            </div>
            <Command.List className="overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted">Nothing matches “{q}”.</Command.Empty>
              {inEditor && (
                <Command.Group heading="Editor">
                  {EDITOR_ITEMS.filter((i) => match(q, i.label)).map((i) => (
                    <Item key={i.cmd} icon={i.icon} onSelect={() => editor(i.cmd)} hint={i.hint}>
                      {i.label}
                    </Item>
                  ))}
                </Command.Group>
              )}
              {results.length > 0 && (
                <Command.Group heading={q ? "SOPs" : "Recent SOPs"}>
                  {results.map((r) => (
                    <div key={r.id}>
                      <Item icon={<FileText />} onSelect={() => go(`/sops/${r.id}`)} hint={r.documentCode} value={`sop-${r.id}`}>
                        {r.title}
                      </Item>
                      {r.hits.slice(0, 2).map((h) => (
                        <Item key={h.blockId} icon={<CornerDownRight />} onSelect={() => go(`/sops/${r.id}#b-${h.blockId}`)} value={`hit-${h.blockId}`} indent>
                          <span className="text-muted">{h.label} · </span>
                          <Highlighted text={h.snippet} />
                        </Item>
                      ))}
                    </div>
                  ))}
                </Command.Group>
              )}
              {q.trim() && (
                <Command.Group heading="Search">
                  <Item icon={<Search />} onSelect={() => go(`/search?q=${encodeURIComponent(q.trim())}`)} value="search-all">
                    Search all SOPs for “{q.trim()}”
                  </Item>
                </Command.Group>
              )}
              <Command.Group heading="Go to">
                {[
                  { label: "Home", href: "/", icon: <Home />, show: signedIn },
                  { label: "Inbox", href: "/inbox", icon: <Inbox />, show: signedIn },
                  { label: "Tasks", href: "/tasks", icon: <ListTodo />, show: canCreate },
                  { label: "Projects", href: "/projects", icon: <FolderKanban />, show: signedIn },
                  { label: "Runs", href: "/runs", icon: <ListChecks />, show: signedIn },
                  { label: "Contractors", href: "/contractors", icon: <HardHat />, show: canCreate },
                  { label: "Roster", href: "/roster", icon: <Users />, show: signedIn },
                  { label: "Training", href: "/training", icon: <GraduationCap />, show: signedIn },
                  { label: "Gear", href: "/gear", icon: <Box />, show: canCreate },
                  { label: "Reviews", href: "/reviews", icon: <CalendarClock />, show: canCreate },
                  { label: "Budgets", href: "/purchasing", icon: <ShoppingCart />, show: canCreate },
                  { label: "Snippets", href: "/snippets", icon: <Puzzle />, show: canCreate },
                  { label: "Analytics", href: "/analytics", icon: <BarChart3 />, show: canCreate },
                  { label: "All SOPs", href: "/sops", icon: <BookOpen />, show: true },
                  { label: "New SOP", href: "/sops/new", icon: <FilePlus2 />, show: canCreate },
                  { label: "Search with filters", href: `/search${q ? `?q=${encodeURIComponent(q)}` : ""}`, icon: <Search />, show: !q.trim() },
                  { label: "Profile & password", href: "/profile", icon: <KeyRound />, show: signedIn },
                ]
                  .filter((i) => i.show && match(q, i.label))
                  .map((i) => (
                    <Item key={i.label} icon={i.icon} onSelect={() => go(i.href)}>
                      {i.label}
                    </Item>
                  ))}
                {match(q, "Toggle light and dark mode") && (
                  <Item
                    icon={<Moon />}
                    onSelect={() => {
                      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
                      document.documentElement.dataset.theme = next;
                      try {
                        localStorage.setItem("hcc-theme", next);
                      } catch {}
                      setOpen(false);
                    }}
                  >
                    Toggle light and dark mode
                  </Item>
                )}
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

const match = (q: string, label: string) => !q || label.toLowerCase().includes(q.toLowerCase());

const EDITOR_ITEMS: { cmd: EditorCommand; label: string; icon: ReactNode; hint?: string }[] = [
  { cmd: "insert-step", label: "Insert step", icon: <ListOrdered />, hint: "/step" },
  { cmd: "insert-substep", label: "Insert sub-step", icon: <CornerDownRight />, hint: "Tab" },
  { cmd: "insert-heading", label: "Insert heading", icon: <Heading2 /> },
  { cmd: "insert-checklist", label: "Insert checklist item", icon: <ListChecks /> },
  { cmd: "insert-callout", label: "Insert callout", icon: <MessageSquareWarning /> },
  { cmd: "insert-code", label: "Insert code / command", icon: <Terminal /> },
  { cmd: "insert-table", label: "Insert table", icon: <Table /> },
  { cmd: "insert-image", label: "Insert image", icon: <ImageIcon /> },
  { cmd: "insert-divider", label: "Insert divider", icon: <Minus /> },
  { cmd: "preview", label: "Toggle preview", icon: <Eye /> },
  { cmd: "publish", label: "Publish…", icon: <Send /> },
];

function Item({ children, icon, onSelect, hint, value, indent }: { children: ReactNode; icon: ReactNode; onSelect: () => void; hint?: string; value?: string; indent?: boolean }) {
  return (
    <Command.Item
      value={value ?? (typeof children === "string" ? children : undefined)}
      onSelect={onSelect}
      className={`flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] text-fg-2 data-[selected=true]:bg-wash data-[selected=true]:text-fg-hi [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted ${indent ? "pl-8" : ""}`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="font-mono text-[11px] text-faint">{hint}</span>}
    </Command.Item>
  );
}

export { EDITOR_COMMAND };
