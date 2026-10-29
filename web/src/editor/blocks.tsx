"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, CornerDownRight, FileText, Info, OctagonAlert, Plus, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { BranchRule } from "@/blocks/schema";
import { useEditorStore, type StepOption } from "./store";

// ---------------------------------------------------------------------------
// Step: title is editable inline; fields live in a compact panel under it.
// Enter makes the next step, Tab / Shift+Tab nest and un-nest (sub-steps 3.2.1).
// ---------------------------------------------------------------------------

export const StepBlock = createReactBlockSpec(
  {
    type: "step",
    propSchema: {
      description: { default: "" },
      roleId: { default: "" },
      estDuration: { default: 0 },
      expectedResult: { default: "" },
      warning: { default: "" },
      collapsed: { default: false },
      /** JSON array of { condition, target } (target is a step's key). */
      branches: { default: "[]" },
      /** Numbering starts again at 1 at this step (top level only). */
      restart: { default: false },
    },
    content: "inline",
  },
  {
    experimental_keyboard: { splitKeepsType: true, emptyEnterResets: true, resetsTo: { type: "paragraph" } },
    render: function StepView({ block, editor, contentRef }) {
      const num = useEditorStore(editor, (s) => s.numbers.get(block.id) ?? "");
      const roles = useEditorStore(editor, (s) => s.roles);
      const steps = useEditorStore(editor, (s) => s.steps);
      const ownKey = useEditorStore(editor, (s) => s.keyOf(block.id));
      const p = block.props;
      const update = (props: Partial<typeof p>) => editor.updateBlock(block, { props: props as never });
      const hasNested = block.children.length > 0;
      return (
        <div className="hcc-step" data-collapsed={p.collapsed ? "true" : undefined}>
          <div className="flex items-start gap-3">
            <span contentEditable={false} className="hcc-step-num mt-[1px] select-none" aria-label={`Step ${num}`}>
              {num || "·"}
            </span>
            <div ref={contentRef} className="hcc-step-title min-w-0 flex-1" />
            {(hasNested || p.description || p.expectedResult || p.warning || p.branches !== "[]") && (
              <button
                type="button"
                contentEditable={false}
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[4px] text-muted hover:bg-wash hover:text-fg-hi"
                onClick={() => update({ collapsed: !p.collapsed })}
                aria-label={p.collapsed ? "Expand step" : "Collapse step"}
                title={p.collapsed ? "Expand" : "Collapse"}
              >
                {p.collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </button>
            )}
          </div>
          {!p.collapsed && <StepFields props={p} roles={roles} steps={steps.filter((x) => x.key !== ownKey)} onChange={update} />}
        </div>
      );
    },
  },
);

type StepProps = { description: string; roleId: string; estDuration: number; expectedResult: string; warning: string; collapsed: boolean; branches: string };

function parseBranches(raw: string): BranchRule[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((b) => b && typeof b.condition === "string" && typeof b.target === "string") : [];
  } catch {
    return [];
  }
}

function StepFields({ props: p, roles, steps, onChange }: { props: StepProps; roles: { id: string; name: string }[]; steps: StepOption[]; onChange: (patch: Partial<StepProps>) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const branches = parseBranches(p.branches);
  const setBranches = (next: BranchRule[]) => onChange({ branches: JSON.stringify(next) });
  const show = (k: "description" | "expectedResult" | "warning") => Boolean(p[k]) || open[k];
  return (
    <div contentEditable={false} className="hcc-step-fields ml-[38px] mt-1.5 grid gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className={cn("hcc-chip", !p.roleId && "hcc-chip-empty")} title="Who does this step">
          <UserRound className="size-3" aria-hidden />
          <select value={p.roleId} onChange={(e) => onChange({ roleId: e.target.value })} aria-label="Owner role" className="max-w-40 bg-transparent outline-none">
            <option value="">Any role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className={cn("hcc-chip", !p.estDuration && "hcc-chip-empty")} title="Estimated minutes">
          <Clock className="size-3" aria-hidden />
          <DraftNumber value={p.estDuration} onCommit={(v) => onChange({ estDuration: v })} />
          <span className="text-faint">min</span>
        </label>
        {!show("description") && (
          <button type="button" className="hcc-chip hcc-chip-add hcc-chip-empty" onClick={() => setOpen({ ...open, description: true })}>
            <Plus className="size-3" /> Details
          </button>
        )}
        {!show("expectedResult") && (
          <button type="button" className="hcc-chip hcc-chip-add hcc-chip-empty" onClick={() => setOpen({ ...open, expectedResult: true })}>
            <Plus className="size-3" /> Expected result
          </button>
        )}
        {!show("warning") && (
          <button type="button" className="hcc-chip hcc-chip-add hcc-chip-empty" onClick={() => setOpen({ ...open, warning: true })}>
            <Plus className="size-3" /> Warning
          </button>
        )}
        {branches.length < 10 && steps.length > 0 && (
          <button
            type="button"
            className="hcc-chip hcc-chip-add hcc-chip-empty"
            title="If something happens, go to another step"
            onClick={() => setBranches([...branches, { condition: "", target: steps[0].key }])}
          >
            <Plus className="size-3" /> Branch
          </button>
        )}
      </div>
      {branches.map((b, i) => (
        <BranchRow
          key={i}
          branch={b}
          steps={steps}
          autoFocus={!b.condition}
          onChange={(next) => setBranches(branches.map((x, j) => (j === i ? next : x)))}
          onRemove={() => setBranches(branches.filter((_, j) => j !== i))}
        />
      ))}
      {show("description") && <DraftText icon={<FileText className="size-3.5 text-muted" />} label="Details" placeholder="Exactly what to do. Use **bold** and `code`." value={p.description} autoFocus={open.description} onCommit={(v) => onChange({ description: v })} />}
      {show("warning") && <DraftText tone="warn" icon={<AlertTriangle className="size-3.5 text-warn" />} label="Warning" placeholder="What could go wrong, and how to avoid it." value={p.warning} autoFocus={open.warning} onCommit={(v) => onChange({ warning: v })} />}
      {show("expectedResult") && <DraftText icon={<CheckCircle2 className="size-3.5 text-good" />} label="Expected result" placeholder="What you should see when this step worked." value={p.expectedResult} autoFocus={open.expectedResult} onCommit={(v) => onChange({ expectedResult: v })} />}
    </div>
  );
}

function BranchRow({ branch, steps, onChange, onRemove, autoFocus }: { branch: BranchRule; steps: StepOption[]; onChange: (b: BranchRule) => void; onRemove: () => void; autoFocus?: boolean }) {
  const [condition, change, bind] = useDraft(branch.condition, (c) => onChange({ ...branch, condition: c }));
  const known = steps.some((s) => s.key === branch.target);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-line px-2.5 py-1.5 text-[14px]">
      <CornerDownRight className="size-3.5 text-muted" aria-hidden />
      <span className="text-muted">If</span>
      <input
        value={condition}
        autoFocus={autoFocus}
        onChange={(e) => change(e.target.value.slice(0, 300))}
        {...bind}
        placeholder="the projector doesn't power on"
        aria-label="Branch condition"
        className="min-w-40 flex-1 bg-transparent text-fg-2 outline-none placeholder:text-faint"
      />
      <span className="text-muted">go to</span>
      <select value={branch.target} onChange={(e) => onChange({ ...branch, target: e.target.value })} aria-label="Branch target step" className="max-w-56 rounded-[4px] bg-wash px-1.5 py-0.5 text-[13px] outline-none">
        {!known && <option value={branch.target}>Removed step</option>}
        {steps.map((s) => (
          <option key={s.key} value={s.key}>
            Step {s.number}
            {s.title ? `: ${s.title.slice(0, 40)}` : ""}
          </option>
        ))}
      </select>
      <button type="button" onClick={onRemove} className="grid size-6 place-items-center rounded-[4px] text-muted hover:bg-wash hover:text-fg-hi" aria-label="Remove branch">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** Local state while typing; commits to the block after a pause and on blur, so focus never jumps. */
function useDraft<T>(value: T, onCommit: (v: T) => void, delay = 500) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!focused.current) setV(value);
  }, [value]);
  const change = (next: T) => {
    setV(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(next), delay);
  };
  const bind = {
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      clearTimeout(timer.current);
      if (v !== value) onCommit(v);
    },
  };
  return [v, change, bind] as const;
}

function DraftText({ value, onCommit, label, placeholder, icon, tone, autoFocus }: { value: string; onCommit: (v: string) => void; label: string; placeholder: string; icon: React.ReactNode; tone?: "warn"; autoFocus?: boolean }) {
  const [v, change, bind] = useDraft(value, onCommit);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [v]);
  return (
    <div className={cn("flex gap-2 rounded-[6px] border border-line px-2.5 py-1.5", tone === "warn" && "border-l-2 border-l-warn")}>
      <span className="mt-[3px]" title={label}>
        {icon}
      </span>
      <textarea
        ref={ref}
        rows={1}
        value={v}
        autoFocus={autoFocus}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => change(e.target.value)}
        {...bind}
        className="min-h-6 w-full resize-none bg-transparent text-[14px] leading-6 text-fg-2 outline-none placeholder:text-faint"
      />
    </div>
  );
}

function DraftNumber({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, change, bind] = useDraft(value ? String(value) : "", (s) => onCommit(Math.max(0, Math.min(100_000, Math.round(Number(s) || 0)))));
  return <input inputMode="numeric" value={v} onChange={(e) => change(e.target.value.replace(/[^\d]/g, ""))} {...bind} placeholder="–" aria-label="Estimated minutes" className="w-8 bg-transparent text-center font-mono outline-none" />;
}

// ---------------------------------------------------------------------------
// Callout: info / warning / danger with an icon; click the icon to change it.
// ---------------------------------------------------------------------------

const VARIANTS = {
  info: { icon: Info, label: "Note", next: "warning" },
  warning: { icon: AlertTriangle, label: "Warning", next: "danger" },
  danger: { icon: OctagonAlert, label: "Danger", next: "info" },
} as const;

export const CalloutBlock = createReactBlockSpec(
  {
    type: "callout",
    propSchema: { variant: { default: "info", values: ["info", "warning", "danger"] as const } },
    content: "inline",
  },
  {
    render: function CalloutView({ block, editor, contentRef }) {
      const v = VARIANTS[block.props.variant as keyof typeof VARIANTS] ?? VARIANTS.info;
      const Icon = v.icon;
      return (
        <div className="hcc-callout" data-variant={block.props.variant}>
          <button
            type="button"
            contentEditable={false}
            className="hcc-callout-icon"
            onClick={() => editor.updateBlock(block, { props: { variant: v.next } })}
            title={`${v.label}. Click to change.`}
            aria-label={`${v.label} callout. Change type`}
          >
            <Icon className="size-4" />
          </button>
          <div ref={contentRef} className="min-w-0 flex-1" />
        </div>
      );
    },
  },
);
