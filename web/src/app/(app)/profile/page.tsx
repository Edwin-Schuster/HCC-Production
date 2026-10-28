import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { Page, PageHeader } from "@/components/page";
import { PasswordForm } from "./password-form";
import { getDb } from "@/db";
import { atLeast } from "@/server/permissions";
import { listApiKeys } from "@/server/services/apikeys";
import { ApiKeys } from "@/components/api-keys";
import { getNtfyTopic } from "@/server/services/push";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PhoneAlerts } from "./phone-alerts";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <Page>
      <Suspense fallback={<div className="h-64" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("viewer", "/profile");
  const db = await getDb();
  const [topic, [ws]] = await Promise.all([getNtfyTopic(db, actor), db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, actor.workspaceId))]);
  return (
    <>
      <PageHeader title={actor.name} subtitle={`Signed in as ${actor.username} · ${actor.role}`} />
      <section className="max-w-md rounded-[12px] border border-line bg-surface p-5">
        <h2 className="mb-4 text-[15px]">Change password</h2>
        <PasswordForm />
      </section>
      <section className="mt-8 max-w-md rounded-[12px] border border-line bg-surface p-5" aria-labelledby="alerts-h">
        <h2 id="alerts-h" className="mb-3 text-[15px]">
          Phone alerts
        </h2>
        <PhoneAlerts topic={topic} server={(ws?.settings?.ntfyServer || "https://ntfy.sh").replace(/\/+$/, "")} />
      </section>
      <section className="mt-8 max-w-3xl">
        <h2 className="text-[15px] text-fg-hi">API keys</h2>
        <p className="mb-4 mt-1 text-[13px] text-muted">For the browser extension and other tools. A key acts as you, with no more access than you have. See the API reference under Integrations.</p>
        <ApiKeys keys={await listApiKeys(db, actor, { mine: true })} canEdit={atLeast(actor, "editor")} />
      </section>
    </>
  );
}
