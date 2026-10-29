"use client";

import { useSyncExternalStore } from "react";
import type { BlockNode } from "@/blocks/schema";
import type { SnippetResolver } from "@/blocks/snippets";
import type { ImageExtras } from "./convert";

export type StepOption = { key: string; number: string; title: string };
/** Snippets the editor can insert, with the blocks needed to preview them (latest and any pinned versions in use). */
export type SnippetCatalogItem = { id: string; name: string; currentVersion: number; versions: Record<number, BlockNode[]> };

/**
 * Per-editor data that custom block views need (step numbers, team roles).
 * Block views render through BlockNote's node-view portals, so this is a plain store rather than React context.
 */
type State = {
  numbers: Map<string, string>;
  roles: { id: string; name: string }[];
  /** Steps a branch can point to. */
  steps: StepOption[];
  snippets: SnippetCatalogItem[];
  /** Annotation data for image blocks, by editor id (BlockNote's image block has no props for it). */
  images: Map<string, ImageExtras>;
  /** Stable key of an editor block (its id unless it was loaded from the server). */
  keyOf: (id: string) => string;
  /** Image block being annotated, if any. */
  annotating: string | null;
  /** Image block being resized or cropped, if any. */
  resizing: string | null;
};

class EditorStore {
  private state: State = { numbers: new Map(), roles: [], steps: [], snippets: [], images: new Map(), keyOf: (id) => id, annotating: null, resizing: null };
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

/** Resolves snippet references from the catalog the editor was opened with. */
export function catalogResolver(catalog: SnippetCatalogItem[]): SnippetResolver {
  return (id, version) => {
    const item = catalog.find((c) => c.id === id);
    if (!item) return null;
    const v = version ?? item.currentVersion;
    const blocks = item.versions[v] ?? item.versions[item.currentVersion];
    return blocks ? { name: item.name, version: v, blocks } : null;
  };
}
