"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/lib/api/auth";
import { validateSignIn, type SignInField } from "@/lib/auth";
import { MOCK_DEMO_ACCOUNT } from "@/lib/mock/auth";
import { AuthField } from "./auth-field";
import { FormAlert, SUBMIT_CLASS } from "./form-parts";
import { useAuthForm } from "./use-auth-form";

const ORDER: readonly SignInField[] = ["email", "password"];

export function SignInForm({ next = "/pengaturan/profil" }: { next?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const form = useAuthForm(ORDER, { email: "", password: "" }, validateSignIn);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        form.submit(async (values) => {
          const account = await signIn(values);
          setStatus(`Berhasil masuk sebagai ${account.displayName}. Mengalihkan…`);
          router.push(next);
        });
      }}
      className="space-y-4"
    >
      {form.formError ? <FormAlert>{form.formError}</FormAlert> : null}
      <p role="status" aria-live="polite" className={status ? "text-xs text-emerald-300" : "sr-only"}>
        {status}
      </p>
      <AuthField id="masuk-email" label="Email" type="email" autoComplete="email" inputMode="email" placeholder="nama@domain.com" {...form.bind("email")} />
      <AuthField id="masuk-sandi" label="Kata sandi" type="password" autoComplete="current-password" {...form.bind("password")} />
      <button type="submit" disabled={form.pending} className={SUBMIT_CLASS}>
        {form.pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {form.pending ? "Memeriksa…" : "Masuk"}
      </button>
      <p className="rounded-lg bg-surface-raised px-3 py-2 text-[11px] text-muted">
        Akun demo: <span className="font-mono text-foreground">{MOCK_DEMO_ACCOUNT.email}</span> / <span className="font-mono text-foreground">{MOCK_DEMO_ACCOUNT.password}</span>
      </p>
    </form>
  );
}
