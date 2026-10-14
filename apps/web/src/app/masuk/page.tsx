import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { firstParam } from "@/lib/flow-filter";
import { authHref, RETURN_PARAM, safeReturnPath } from "@/lib/return-to";

export const metadata: Metadata = {
  title: "Masuk",
  description: "Masuk untuk menyimpan kasus, laporan, dan catatan investigasi.",
};

export default async function SignInPage({ searchParams }: PageProps<"/masuk">) {
  const params = await searchParams;
  const signedOut = firstParam(params.keluar) === "1";
  const returnTo = firstParam(params[RETURN_PARAM]);
  return (
    <AuthShell
      title="Masuk"
      description="Masuk untuk menyimpan kasus, laporan, dan catatan investigasi."
      footer={
        <>
          Belum punya akun?{" "}
          <Link href={authHref("/daftar", returnTo)} className="font-medium text-accent hover:underline">
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
      <SignInForm next={safeReturnPath(returnTo)} />
    </AuthShell>
  );
}
