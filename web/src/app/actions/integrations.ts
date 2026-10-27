"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createApiKey, revokeApiKey, type ApiKeyInput } from "@/server/services/apikeys";
import { createWebhook, deleteWebhook, sendTest, type WebhookInput } from "@/server/services/webhooks";
import { rotateCalendarToken } from "@/server/services/calendar";
import { updateSettings, type SettingsInput } from "@/server/services/settings";
import { run } from "./run";

const Id = z.string().min(1).max(64);
const done = <T,>(res: { ok: boolean } & T) => {
  if (res.ok) refresh();
  return res;
};

export const createApiKeyAction = async (input: z.input<typeof ApiKeyInput>) => done(await run((db, actor) => createApiKey(db, actor, input)));
export const revokeApiKeyAction = async (id: string) => done(await run((db, actor) => revokeApiKey(db, actor, Id.parse(id))));
export const createWebhookAction = async (input: z.input<typeof WebhookInput>) => done(await run((db, actor) => createWebhook(db, actor, input)));
export const deleteWebhookAction = async (id: string) => done(await run((db, actor) => deleteWebhook(db, actor, Id.parse(id))));
export const testWebhookAction = async (id: string) => done(await run((db, actor) => sendTest(db, actor, Id.parse(id))));
export const saveSettingsAction = async (input: z.input<typeof SettingsInput>) => done(await run((db, actor) => updateSettings(db, actor, input)));
export const calendarFeedAction = async (enabled: boolean) => done(await run((db, actor) => rotateCalendarToken(db, actor, z.boolean().parse(enabled))));
