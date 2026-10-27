"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { acceptSuggestion, addComment, deleteComment, rejectSuggestion, setResolved, type CommentInput } from "@/server/services/comments";
import { resolveFeedback, submitFeedback, type FeedbackInput, type ResolveFeedbackInput } from "@/server/services/feedback";
import { run } from "./run";

const Id = z.string().min(1).max(64);
const done = <T,>(res: { ok: boolean } & T) => {
  if (res.ok) refresh();
  return res;
};

export const submitFeedbackAction = async (sopId: string, input: z.input<typeof FeedbackInput>) => done(await run((db, actor) => submitFeedback(db, actor, Id.parse(sopId), input)));
export const resolveFeedbackAction = async (id: string, input: z.input<typeof ResolveFeedbackInput>) => done(await run((db, actor) => resolveFeedback(db, actor, Id.parse(id), input)));
export const addCommentAction = async (sopId: string, input: z.input<typeof CommentInput>) => done(await run((db, actor) => addComment(db, actor, Id.parse(sopId), input)));
export const setResolvedAction = async (id: string, resolved: boolean) => done(await run((db, actor) => setResolved(db, actor, Id.parse(id), z.boolean().parse(resolved))));
export const deleteCommentAction = async (id: string) => done(await run((db, actor) => deleteComment(db, actor, Id.parse(id))));
export const acceptSuggestionAction = async (id: string) => done(await run((db, actor) => acceptSuggestion(db, actor, Id.parse(id))));
export const rejectSuggestionAction = async (id: string) => done(await run((db, actor) => rejectSuggestion(db, actor, Id.parse(id))));
