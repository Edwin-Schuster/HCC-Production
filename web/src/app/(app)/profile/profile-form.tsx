"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { saveProfileAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveProfileAction({ name: String(fd.get("name")), email: String(fd.get("email") ?? "") });
          if (res.ok) toast("Profile saved");
          else toast.error(res.error);
        });
      }}
    >
      <Field label="Name" htmlFor="pf-name" hint="Shown in the sidebar, on tasks and comments, and on your roster card.">
        <Input id="pf-name" name="name" defaultValue={name} maxLength={80} autoComplete="name" required />
      </Field>
      <Field label="Email" htmlFor="pf-email">
        <Input id="pf-email" name="email" type="email" defaultValue={email} autoComplete="email" />
      </Field>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
