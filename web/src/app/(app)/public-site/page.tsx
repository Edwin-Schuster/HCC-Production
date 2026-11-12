import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { getDb } from "@/db";
import { requireRole } from "@/server/context";
import { siteForEditing } from "@/server/services/public-site";
import { Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { PublicGearEditor, RoomsEditor, ServicesEditor, SiteTextEditor } from "@/components/site/site-editor";

export const metadata: Metadata = { title: "Public site" };

/** Editors and admins manage the public HCC Production site here. */
export default function PublicSitePage() {
  return (
    <Page wide>
      <PageHeader
        title="Public site"
        subtitle="What anyone sees at the site's address without signing in: the home page, What we do, Gear at Hope and the guest page. Public SOPs come from folders marked public."
        actions={
          <Button asChild size="sm">
            <Link href="/welcome" target="_blank">
              <ExternalLink /> Open the public site
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<div className="h-96" />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const actor = await requireRole("editor", "/public-site");
  const site = await siteForEditing(await getDb(), actor);
  return (
    <div className="grid gap-6">
      <SiteTextEditor text={site.text} field="home" />
      <ServicesEditor services={site.services} />
      <RoomsEditor rooms={site.rooms} layouts={site.layouts} />
      <PublicGearEditor gear={site.gear} rooms={site.rooms} />
      <SiteTextEditor text={site.text} field="guests" />
    </div>
  );
}
