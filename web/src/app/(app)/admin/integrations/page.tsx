import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { listApiKeys } from "@/server/services/apikeys";
import { listWebhooks, WEBHOOK_EVENTS } from "@/server/services/webhooks";
import { Page, PageHeader } from "@/components/page";
import { ApiKeys } from "@/components/api-keys";
import { Webhooks } from "./webhooks";

export const metadata: Metadata = { title: "Integrations" };

const ENDPOINTS: [string, string, string][] = [
  ["GET", "/api/v1/me", "Who the key belongs to"],
  ["GET", "/api/v1/sops?folder=&tag=&status=&owner=", "SOPs you can read"],
  ["GET", "/api/v1/sops/{id}?version=3|draft", "One SOP with its blocks"],
  ["POST", "/api/v1/sops", "Create an SOP: { title, folderId, summary?, tags?, blocks? } (write key)"],
  ["PUT", "/api/v1/sops/{id}/draft", "Replace the draft: { blocks, title?, summary?, baseUpdatedAt? } (write key)"],
  ["POST", "/api/v1/sops/{id}/publish", "Publish the draft: { changeSummary } (write key; approvals apply)"],
  ["GET", "/api/v1/search?q=", "Full-text search; hits name the matching step"],
  ["GET", "/api/v1/folders", "Folders you can see"],
  ["GET", "/api/v1/match?url=", "SOPs about a web page (their “web pages” patterns)"],
  ["POST", "/api/files", "Upload an image or video (multipart, field “file”); returns { url }"],
];

export default function IntegrationsPage() {
  return (
    <Page>
      <PageHeader title="Integrations" subtitle="The REST API, webhooks and embedding SOPs in other sites." />
      <Suspense fallback={<div className="h-96" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("admin", "/admin/integrations");
  const db = await getDb();
  const [keys, hooks] = await Promise.all([listApiKeys(db, actor), listWebhooks(db, actor)]);
  return (
    <div className="grid gap-10">
      <section>
        <h2 className="text-[15px] text-fg-hi">REST API</h2>
        <p className="mb-3 mt-1 text-[13px] text-muted">
          Send <code className="font-mono text-fg-2">Authorization: Bearer hcc_…</code> with a key from someone's profile. Responses are JSON; errors are <code className="font-mono text-fg-2">{"{ error, code }"}</code> with a 4xx status. Blocks use the same structure the app stores.
        </p>
        <div className="overflow-x-auto rounded-[12px] border border-line">
          <table className="w-full text-[13px]">
            <tbody>
              {ENDPOINTS.map(([m, path, what]) => (
                <tr key={m + path} className="border-b border-line last:border-0">
                  <td className="w-16 px-3 py-2 font-mono text-xs text-muted">{m}</td>
                  <td className="px-3 py-2 font-mono text-xs text-fg-hi">{path}</td>
                  <td className="px-3 py-2 text-fg-2">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] text-fg-hi">All API keys</h2>
        <p className="mb-3 mt-1 text-[13px] text-muted">Everyone's keys. Revoke any that shouldn't work any more.</p>
        <ApiKeys keys={keys} canEdit showOwner />
      </section>

      <section>
        <h2 className="text-[15px] text-fg-hi">Webhooks</h2>
        <p className="mb-3 mt-1 text-[13px] text-muted">
          We POST JSON <code className="font-mono text-fg-2">{"{ event, createdAt, data }"}</code> with an <code className="font-mono text-fg-2">X-HCC-Signature: sha256=…</code> header: the HMAC-SHA256 of the body with the signing secret. Failed deliveries are retried for about 15 hours.
        </p>
        <Webhooks hooks={hooks} events={WEBHOOK_EVENTS} />
      </section>

      <section>
        <h2 className="text-[15px] text-fg-hi">Embed an SOP</h2>
        <p className="mb-3 mt-1 text-[13px] text-muted">Paste this into any web page. Use the SOP's id for SOPs in public folders, or a share link's code for any other SOP. It resizes itself.</p>
        <pre className="overflow-x-auto rounded-[12px] border border-line bg-surface px-4 py-3 font-mono text-xs text-fg-2">{`<div data-hcc-sop="SOP_ID"></div>
<!-- or: <div data-hcc-share="SHARE_LINK_CODE"></div> -->
<script src="${"https://YOUR-HCC-ADDRESS"}/embed.js" async></script>`}</pre>
      </section>
    </div>
  );
}
