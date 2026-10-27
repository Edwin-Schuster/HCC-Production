import { z } from "zod";

/** A run of inline text. Rich text is an array of runs; never HTML. */
export const InlineRun = z.object({
  text: z.string().max(20_000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
  code: z.boolean().optional(),
  href: z
    .string()
    .max(2_000)
    .regex(/^(https?:|mailto:|tel:|\/)/i, "Links must start with http(s):, mailto:, tel: or /")
    .optional(),
});
export type InlineRun = z.infer<typeof InlineRun>;
export const RichText = z.array(InlineRun).max(500);
export type RichText = z.infer<typeof RichText>;

export const BLOCK_TYPES = ["heading", "text", "step", "checklist", "callout", "code", "table", "image", "divider"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export const CALLOUT_VARIANTS = ["info", "warning", "danger"] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

const short = (max: number) => z.string().max(max);

export const ContentSchemas = {
  heading: z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]), text: RichText }),
  text: z.object({ text: RichText }),
  step: z.object({
    title: RichText,
    description: short(10_000).default(""),
    roleId: z.string().max(64).nullable().default(null),
    /** Estimated duration in minutes. */
    estDuration: z.number().int().min(0).max(100_000).nullable().default(null),
    expectedResult: short(5_000).default(""),
    warning: short(5_000).default(""),
    collapsed: z.boolean().default(false),
  }),
  checklist: z.object({ text: RichText, checked: z.boolean().default(false) }),
  callout: z.object({ variant: z.enum(CALLOUT_VARIANTS), text: RichText }),
  code: z.object({ language: short(40).default("text"), code: short(100_000) }),
  table: z.object({
    headerRow: z.boolean().default(true),
    rows: z.array(z.array(RichText).max(30)).max(500),
  }),
  image: z.object({
    url: short(2_000).regex(/^(https?:|\/|data:image\/)/i, "Images must be uploaded files or http(s) links"),
    caption: short(1_000).default(""),
    width: z.number().int().min(40).max(4_000).nullable().default(null),
  }),
  divider: z.object({}),
} satisfies Record<BlockType, z.ZodType>;

export type BlockContent<T extends BlockType = BlockType> = z.infer<(typeof ContentSchemas)[T]>;

/** Tree form used by the app (editor, reading view, PDF). */
export type BlockNode = {
  [T in BlockType]: {
    id: string;
    /** Stable identity across versions. Defaults to id for new blocks. */
    key: string;
    type: T;
    content: BlockContent<T>;
    children: BlockNode[];
  };
}[BlockType];

export const MAX_DEPTH = 6;
export const MAX_BLOCKS = 2_000;

const BlockNodeBase = z.object({
  id: z.string().min(1).max(64),
  key: z.string().min(1).max(64).optional(),
  type: z.enum(BLOCK_TYPES),
  content: z.unknown(),
  get children() {
    return z.array(BlockNodeBase).max(500).default([]);
  },
});

/** Validates a whole document and returns it with defaults applied and content parsed per type. */
export const DocumentSchema = z
  .array(BlockNodeBase)
  .max(MAX_BLOCKS)
  .transform((nodes, ctx): BlockNode[] => {
    let count = 0;
    const ids = new Set<string>();
    const walk = (list: z.infer<typeof BlockNodeBase>[], depth: number, path: (string | number)[]): BlockNode[] =>
      list.map((n, i) => {
        count++;
        if (ids.has(n.id)) ctx.addIssue({ code: "custom", message: `Duplicate block id ${n.id}`, path: [...path, i, "id"] });
        ids.add(n.id);
        if (depth > MAX_DEPTH) ctx.addIssue({ code: "custom", message: `Blocks can be nested at most ${MAX_DEPTH} levels deep`, path: [...path, i] });
        const parsed = ContentSchemas[n.type].safeParse(n.content ?? {});
        if (!parsed.success) {
          for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: [...path, i, "content", ...issue.path] } as never);
        }
        return {
          id: n.id,
          key: n.key ?? n.id,
          type: n.type,
          content: parsed.success ? parsed.data : {},
          children: walk(n.children ?? [], depth + 1, [...path, i, "children"]),
        } as BlockNode;
      });
    const out = walk(nodes, 1, []);
    if (count > MAX_BLOCKS) ctx.addIssue({ code: "custom", message: `An SOP can have at most ${MAX_BLOCKS} blocks` });
    return out;
  });
