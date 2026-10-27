import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getActor } from "@/server/context";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[linear-gradient(180deg,var(--bg)_10%,color-mix(in_srgb,var(--fg-2)_9%,var(--bg))_100%)] px-4 py-10">
      <div className="w-full max-w-[400px] rounded-[12px] border border-line bg-surface px-7 py-8 shadow-lg">
        <div className="mb-7 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/brand/hcc-logo.png" alt="Hope Christian Church" className="mx-auto w-[200px] [[data-theme=light]_&]:invert" />
          <p className="mt-2 text-[11px] font-[510] uppercase tracking-[0.32em] text-muted">Production</p>
        </div>
        <Suspense fallback={<div className="h-[188px]" />}>
          <Form searchParams={props.searchParams} />
        </Suspense>
        <p className="mt-5 text-center text-[13px] text-muted">
          <Link href="/sops" className="underline decoration-line-2 underline-offset-2 hover:text-fg-hi">
            Read public SOPs without signing in
          </Link>
        </p>
      </div>
    </main>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/sops";
  const actor = await getActor();
  if (actor.userId) redirect(next);
  return <LoginForm next={next} />;
}
