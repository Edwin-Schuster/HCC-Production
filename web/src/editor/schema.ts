"use client";

import { BlockNoteSchema, defaultBlockSpecs, type BlockNoteEditor } from "@blocknote/core";
import { CalloutBlock, StepBlock } from "./blocks";
import { EmbedBlock, SnippetBlock, VideoBlock } from "./media-blocks";

const { paragraph, heading, checkListItem, codeBlock, table, image, divider } = defaultBlockSpecs;

/** Exactly the block types the stored model supports, so nothing unsupported can be created. */
export const sopSchema = BlockNoteSchema.create({
  blockSpecs: { paragraph, heading, step: StepBlock(), checkListItem, callout: CalloutBlock(), codeBlock, table, image, video: VideoBlock(), embed: EmbedBlock(), snippet: SnippetBlock(), divider },
});

/**
 * BlockNote's per-schema generics don't compose across its helpers, so the editor is typed loosely here.
 * Everything that crosses into our data goes through convert.ts and is validated with Zod.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SopEditor = BlockNoteEditor<any, any, any>;
