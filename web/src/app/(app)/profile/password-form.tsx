"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { changePassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      toast("Password changed");
      form.current?.reset();
    }
  }, [state]);
  return (
    <form ref={form} action={action} className="grid gap-4">
      <Field label="Current password" htmlFor="current">
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="next" hint="At least 8 characters.">
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      {state?.error && <p className="text-[13px] text-bad">{state.error}</p>}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
