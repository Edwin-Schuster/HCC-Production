"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteRoom, deleteService, moveRoom, moveService, saveRoom, saveService, saveSiteText, setGearPublic, type GearPublicInput, type RoomInput, type ServiceInput, type SiteTextInput } from "@/server/services/public-site";
import { run } from "./run";

const Id = z.string().min(1).max(64);
const Dir = z.union([z.literal(-1), z.literal(1)]);
/** The public pages and the editor both show this content. */
const done = <T extends { ok: boolean }>(res: T) => {
  if (res.ok) revalidatePath("/", "layout");
  return res;
};

export const saveSiteTextAction = async (input: z.input<typeof SiteTextInput>) => done(await run((db, actor) => saveSiteText(db, actor, input)));
export const saveServiceAction = async (input: z.input<typeof ServiceInput>, id?: string) => done(await run((db, actor) => saveService(db, actor, input, id ? Id.parse(id) : undefined)));
export const deleteServiceAction = async (id: string) => done(await run((db, actor) => deleteService(db, actor, Id.parse(id))));
export const moveServiceAction = async (id: string, dir: -1 | 1) => done(await run((db, actor) => moveService(db, actor, Id.parse(id), Dir.parse(dir))));
export const saveRoomAction = async (input: z.input<typeof RoomInput>, id?: string) => done(await run((db, actor) => saveRoom(db, actor, input, id ? Id.parse(id) : undefined)));
export const deleteRoomAction = async (id: string) => done(await run((db, actor) => deleteRoom(db, actor, Id.parse(id))));
export const moveRoomAction = async (id: string, dir: -1 | 1) => done(await run((db, actor) => moveRoom(db, actor, Id.parse(id), Dir.parse(dir))));
export const setGearPublicAction = async (gearId: string, input: z.input<typeof GearPublicInput>) => done(await run((db, actor) => setGearPublic(db, actor, Id.parse(gearId), input)));
