"use server";

import { z } from "zod";
import { createShareLink, listShareLinks, revokeShareLink, type ShareInput } from "@/server/services/shares";
import { run } from "./run";

const Id = z.string().min(1).max(64);

export const listShareLinksAction = async (sopId: string) => run((db, actor) => listShareLinks(db, actor, Id.parse(sopId)));
export const createShareLinkAction = async (sopId: string, input: z.input<typeof ShareInput>) => run((db, actor) => createShareLink(db, actor, Id.parse(sopId), input));
export const revokeShareLinkAction = async (id: string) => run((db, actor) => revokeShareLink(db, actor, Id.parse(id)));
