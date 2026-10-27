"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Username" htmlFor="username">
        <Input id="username" name="username" autoComplete="username" autoCapitalize="off" required autoFocus className="h-10" />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
      </Field>
      {state?.error && (
        <p role="alert" className="rounded-[6px] border border-bad/40 bg-bad-soft px-3 py-2 text-[13px] text-bad">
          {state.error}
        </p>
      )}
      <Button variant="primary" size="lg" type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
