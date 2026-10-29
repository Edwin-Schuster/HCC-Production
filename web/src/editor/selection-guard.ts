import { createExtension } from "@blocknote/core";
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";

/**
 * Keeps the cursor in text. Arrowing past a step's extra fields can leave a "gap cursor" (or a text cursor in
 * a block's wrapper rather than its text), and Enter there tries to split a spot that can't be split
 * ("Cannot join blockGroup onto blockContainer"). Such a cursor moves to the nearest place you can type, in
 * the direction it was moving.
 */
export const SelectionGuard = createExtension({
  key: "hccSelectionGuard",
  prosemirrorPlugins: [
    new Plugin({
      key: new PluginKey("hcc-selection-guard"),
      appendTransaction: (_trs, old, state) => {
        const sel = state.selection;
        const stray = sel instanceof TextSelection ? !sel.$from.parent.inlineContent || !sel.$to.parent.inlineContent : sel.toJSON().type === "gapcursor";
        if (!stray) return null;
        const dir = sel.head < old.selection.head ? -1 : 1;
        const target = TextSelection.findFrom(sel.$head, dir, true) ?? TextSelection.findFrom(sel.$head, -dir, true);
        return target && !target.eq(sel) ? state.tr.setSelection(target) : null;
      },
    }),
  ],
});
