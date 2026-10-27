"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { createProject, deleteProject, updateProject, type ProjectInput } from "@/server/services/projects";
import { commentOnTask, createTask, deleteTask, deleteWorkComment, moveTask, updateTask, type TaskInput, type TaskPatch } from "@/server/services/tasks";
import type { TaskStatus } from "@/lib/work";
import { run } from "./run";

const Id = z.string().min(1).max(64);
const done = <T,>(res: { ok: boolean } & T) => {
  if (res.ok) refresh();
  return res;
};

export const saveProjectAction = async (input: z.input<typeof ProjectInput>, id?: string) =>
  done(await run(async (db, actor) => ({ id: (id ? await updateProject(db, actor, Id.parse(id), input) : await createProject(db, actor, input)).id })));

export async function deleteProjectAction(id: string) {
  const res = await run((db, actor) => deleteProject(db, actor, Id.parse(id)));
  if (res.ok) redirect("/projects");
  return res;
}

export const createTaskAction = async (input: z.input<typeof TaskInput>) => done(await run(async (db, actor) => ({ id: (await createTask(db, actor, input)).id })));
export const updateTaskAction = async (id: string, patch: z.input<typeof TaskPatch>) => done(await run(async (db, actor) => void (await updateTask(db, actor, Id.parse(id), patch))));
export const moveTaskAction = async (id: string, status: TaskStatus, index: number) => done(await run((db, actor) => moveTask(db, actor, Id.parse(id), { status, index })));
export const deleteTaskAction = async (id: string) => done(await run((db, actor) => deleteTask(db, actor, Id.parse(id))));
export const commentOnTaskAction = async (id: string, body: string) => done(await run(async (db, actor) => void (await commentOnTask(db, actor, Id.parse(id), { body }))));
export const deleteWorkCommentAction = async (id: string) => done(await run((db, actor) => deleteWorkComment(db, actor, Id.parse(id))));
