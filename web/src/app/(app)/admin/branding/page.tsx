import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { getDb } from "@/db";
import { getBranding } from "@/server/services/branding";
import { Page, PageHeader } from "@/components/page";
import { BrandingForm } from "./branding-form";

export const metadata: Metadata = { title: "Branding" };

export default function BrandingPage() {
  return (
    <Page>
      <PageHeader title="Branding" subtitle="Applies to every SOP's reading view and PDF. The app itself keeps its own look." />
      <Suspense fallback={<div className="h-96" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("admin", "/admin/branding");
  return <BrandingForm initial={await getBranding(await getDb(), actor.workspaceId)} />;
}
