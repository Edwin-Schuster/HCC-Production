"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { addConfigBackup, createGear, deleteGear, logFirmware, readConfigBackup, removeConfigBackup, updateGear, type ConfigInput, type FirmwareInput, type GearInput } from "@/server/services/gear";
import { run } from "./run";

const Id = z.string().min(1).max(64);
const done = <T,>(res: { ok: boolean } & T) => {
  if (res.ok) refresh();
  return res;
};

export async function saveGearAction(input: z.input<typeof GearInput> & { firmware?: string }, id?: string) {
  if (id) return done(await run(async (db, actor) => void (await updateGear(db, actor, Id.parse(id), input))));
  const res = await run((db, actor) => createGear(db, actor, input));
  if (res.ok) redirect(`/gear/${res.data.id}`);
  return res;
}
export async function deleteGearAction(id: string) {
  const res = await run((db, actor) => deleteGear(db, actor, Id.parse(id)));
  if (res.ok) redirect("/gear");
  return res;
}
export const logFirmwareAction = async (id: string, input: z.input<typeof FirmwareInput>) => done(await run((db, actor) => logFirmware(db, actor, Id.parse(id), input)));
export const addConfigAction = async (id: string, input: z.input<typeof ConfigInput>) => done(await run(async (db, actor) => void (await addConfigBackup(db, actor, Id.parse(id), input))));
export const removeConfigAction = async (id: string, backupId: string) => done(await run((db, actor) => removeConfigBackup(db, actor, Id.parse(id), Id.parse(backupId))));
export const readConfigAction = async (id: string, backupId: string) => run((db, actor) => readConfigBackup(db, actor, Id.parse(id), Id.parse(backupId)));
