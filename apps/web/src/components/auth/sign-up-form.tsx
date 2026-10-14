"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signUp } from "@/lib/api/auth";
import { passwordChecks, validateSignUp, type SignUpField } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { AuthField } from "./auth-field";
import { FormAlert, SUBMIT_CLASS } from "./form-parts";
import { useAuthForm } from "./use-auth-form";

const ORDER: readonly SignUpField[] = ["name", "email", "password", "confirm"];

export function SignUpForm({ next = "/pengaturan/profil" }: { next?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const form = useAuthForm(ORDER, { name: "", email: "", password: "", confirm: "" }, validateSignUp);
  const checks = passwordChecks(form.values.password);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        form.submit(async (values) => {
          const account = await signUp(values);
          setStatus(`Akun ${account.email} dibuat. Mengalihkan…`);
          router.push(next);
        });
      }}
      className="space-y-4"
    >
      {form.formError ? <FormAlert>{form.formError}</FormAlert> : null}
      <p role="status" aria-live="polite" className={status ? "text-xs text-emerald-300" : "sr-only"}>
        {status}
      </p>
      <AuthField id="daftar-nama" label="Nama tampilan" autoComplete="name" placeholder="Mis. Rina Analis" {...form.bind("name")} />
      <AuthField id="daftar-email" label="Email" type="email" autoComplete="email" inputMode="email" placeholder="nama@domain.com" {...form.bind("email")} />
      <AuthField
        id="daftar-sandi"
        label="Kata sandi"
        type="password"
        autoComplete="new-password"
        hint={
          <ul aria-label="Syarat kata sandi" className="flex flex-wrap gap-x-3 gap-y-1">
            {checks.map((check) => (
              <li key={check.id} className={cn("inline-flex items-center gap-1", check.ok ? "text-emerald-300" : "text-muted")}>
                {check.ok ? <Check className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}
                {check.label}
                <span className="sr-only">{check.ok ? "(terpenuhi)" : "(belum)"}</span>
              </li>
            ))}
          </ul>
        }
        {...form.bind("password")}
      />
      <AuthField id="daftar-ulang" label="Ulangi kata sandi" type="password" autoComplete="new-password" {...form.bind("confirm")} />
      <button type="submit" disabled={form.pending} className={SUBMIT_CLASS}>
        {form.pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {form.pending ? "Membuat akun…" : "Daftar"}
      </button>
    </form>
  );
}
