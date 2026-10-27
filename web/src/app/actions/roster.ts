"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { checkIn, createPerson, createRole, deletePerson, deleteRole, updatePerson, updateRole, type CheckInInput, type PersonInput, type RoleInput } from "@/server/services/roster";
import { run } from "./run";

const Id = z.string().min(1).max(64);
const done = <T,>(res: { ok: boolean } & T) => {
  if (res.ok) refresh();
  return res;
};

export const checkInAction = async (input: z.input<typeof CheckInInput>) => done(await run((db, actor) => checkIn(db, actor, input)));
export const savePersonAction = async (input: z.input<typeof PersonInput>, id?: string) =>
  done(await run((db, actor) => (id ? updatePerson(db, actor, Id.parse(id), input) : createPerson(db, actor, input))));
export const deletePersonAction = async (id: string) => done(await run((db, actor) => deletePerson(db, actor, Id.parse(id))));
export const saveRoleAction = async (input: z.input<typeof RoleInput>, id?: string) =>
  done(await run(async (db, actor) => void (id ? await updateRole(db, actor, Id.parse(id), input) : await createRole(db, actor, input))));
export const deleteRoleAction = async (id: string) => done(await run((db, actor) => deleteRole(db, actor, Id.parse(id))));
