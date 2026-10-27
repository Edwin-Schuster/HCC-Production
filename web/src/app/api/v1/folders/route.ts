import { api } from "@/server/api/handler";
import { listFolders } from "@/server/services/folders";

export const GET = api(async ({ db, actor }) => ({ folders: await listFolders(db, actor) }));
