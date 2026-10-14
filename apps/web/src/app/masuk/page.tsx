import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { firstParam } from "@/lib/flow-filter";

export const metadata: Metadata = {
  title: "Masuk",
  description: "Masuk untuk menyimpan kasus, laporan, dan catatan investigasi.",
};

export default async function SignInPage({ searchParams }: PageProps<"/masuk">) {
  const signedOut = firstParam((await searchParams).keluar) === "1";
  return (
    <AuthShell
      title="Masuk"
      description="Masuk untuk menyimpan kasus, laporan, dan catatan investigasi."
      footer={
        <>
          Belum punya akun?{" "}
          <Link href="/daftar" className="font-medium text-accent hover:underline">
            Daftar
          </Link>
        </>
      }
    >
      {signedOut ? (
        <p role="status" className="mb-4 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Kamu sudah keluar. Masuk lagi kapan saja untuk melanjutkan investigasi.
        </p>
      ) : null}
      <SignInForm />
    </AuthShell>
  );
}
