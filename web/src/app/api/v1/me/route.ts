import { api } from "@/server/api/handler";

/** Who the key or session belongs to. */
export const GET = api(async ({ actor }) => ({ id: actor.userId, name: actor.name, username: actor.username, role: actor.role }));
