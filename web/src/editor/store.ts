"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-editor data that custom block views need (step numbers, team roles).
 * Block views render through BlockNote's node-view portals, so this is a plain store rather than React context.
 */
type State = { numbers: Map<string, string>; roles: { id: string; name: string }[] };

class EditorStore {
  private state: State = { numbers: new Map(), roles: [] };
  private listeners = new Set<() => void>();
  get = () => this.state;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
}

const stores = new WeakMap<object, EditorStore>();
export function storeFor(editor: object): EditorStore {
  let s = stores.get(editor);
  if (!s) stores.set(editor, (s = new EditorStore()));
  return s;
}

export function useEditorStore<T>(editor: object, pick: (s: State) => T): T {
  const store = storeFor(editor);
  return useSyncExternalStore(store.subscribe, () => pick(store.get()), () => pick(store.get()));
}

type NumberedBlock = { id: string; type: string; children: NumberedBlock[] };

/** Same rules as the reading view: top level 1, 2, 3; sub-steps 3.1, 3.2.1; non-steps are transparent. */
export function numberDocument(blocks: NumberedBlock[]): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (list: NumberedBlock[], prefix: string, counter: { n: number }) => {
    for (const b of list) {
      if (b.type === "step") {
        counter.n += 1;
        const label = prefix ? `${prefix}.${counter.n}` : String(counter.n);
        out.set(b.id, label);
        visit(b.children, label, { n: 0 });
      } else visit(b.children, prefix, counter);
    }
  };
  visit(blocks, "", { n: 0 });
  return out;
}
