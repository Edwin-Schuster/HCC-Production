import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/context";
import { Page, PageHeader } from "@/components/page";
import { PasswordForm } from "./password-form";

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
  return (
    <>
      <PageHeader title={actor.name} subtitle={`Signed in as ${actor.username} · ${actor.role}`} />
      <section className="max-w-md rounded-[12px] border border-line bg-surface p-5">
        <h2 className="mb-4 text-[15px]">Change password</h2>
        <PasswordForm />
      </section>
    </>
  );
}
