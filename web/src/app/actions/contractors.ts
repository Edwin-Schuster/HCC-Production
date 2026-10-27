"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import {
  createContractor,
  deleteAccess,
  deleteContractor,
  deleteInvoice,
  deletePunch,
  deleteScope,
  saveAccess,
  saveInvoice,
  savePunch,
  saveScope,
  updateContractor,
  type AccessInput,
  type ContractorInput,
  type InvoiceInput,
  type PunchInput,
  type ScopeInput,
} from "@/server/services/contractors";
import { run } from "./run";

const Id = z.string().min(1).max(64);
const optId = (id?: string) => (id ? Id.parse(id) : undefined);
const done = <T,>(res: { ok: boolean } & T) => {
  if (res.ok) refresh();
  return res;
};

export async function saveContractorAction(input: z.input<typeof ContractorInput>, id?: string) {
  if (id) return done(await run((db, actor) => updateContractor(db, actor, Id.parse(id), input)));
  const res = await run((db, actor) => createContractor(db, actor, input));
  if (res.ok) redirect(`/contractors/${res.data.id}`);
  return res;
}
export async function deleteContractorAction(id: string) {
  const res = await run((db, actor) => deleteContractor(db, actor, Id.parse(id)));
  if (res.ok) redirect("/contractors");
  return res;
}
export const saveScopeAction = async (input: z.input<typeof ScopeInput>, id?: string) => done(await run(async (db, actor) => void (await saveScope(db, actor, input, optId(id)))));
export const deleteScopeAction = async (id: string) => done(await run((db, actor) => deleteScope(db, actor, Id.parse(id))));
export const saveAccessAction = async (input: z.input<typeof AccessInput>, id?: string) => done(await run(async (db, actor) => void (await saveAccess(db, actor, input, optId(id)))));
export const deleteAccessAction = async (id: string) => done(await run((db, actor) => deleteAccess(db, actor, Id.parse(id))));
export const savePunchAction = async (input: z.input<typeof PunchInput>, id?: string) => done(await run(async (db, actor) => void (await savePunch(db, actor, input, optId(id)))));
export const deletePunchAction = async (id: string) => done(await run((db, actor) => deletePunch(db, actor, Id.parse(id))));
export const saveInvoiceAction = async (input: z.input<typeof InvoiceInput>, id?: string) => done(await run(async (db, actor) => void (await saveInvoice(db, actor, input, optId(id)))));
export const deleteInvoiceAction = async (id: string) => done(await run((db, actor) => deleteInvoice(db, actor, Id.parse(id))));
