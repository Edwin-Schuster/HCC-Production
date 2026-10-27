/** Tiny event bus so any component can open the palette or receive editor commands from it. */
export const PALETTE_OPEN = "hcc:palette-open";
export const EDITOR_COMMAND = "hcc:editor-command";

export function openPalette() {
  window.dispatchEvent(new Event(PALETTE_OPEN));
}

export type EditorCommand = "insert-step" | "insert-substep" | "insert-heading" | "insert-checklist" | "insert-callout" | "insert-code" | "insert-table" | "insert-image" | "insert-divider" | "publish" | "preview";

export function sendEditorCommand(cmd: EditorCommand) {
  window.dispatchEvent(new CustomEvent(EDITOR_COMMAND, { detail: cmd }));
}
