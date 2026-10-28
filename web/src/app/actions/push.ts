"use server";

import { refresh } from "next/cache";
import { setNtfyTopic, testPush } from "@/server/services/push";
import { run } from "./run";

export async function saveTopicAction(topic: string) {
  const res = await run((db, actor) => setNtfyTopic(db, actor, { topic }));
  if (res.ok) refresh();
  return res;
}
export const testPushAction = async () => run((db, actor) => testPush(db, actor));
