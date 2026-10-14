import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { firstParam } from "@/lib/flow-filter";
import { authHref, RETURN_PARAM, safeReturnPath } from "@/lib/return-to";

export const metadata: Metadata = {
  title: "Daftar",
  description: "Buat akun untuk menyimpan kasus, laporan, dan catatan investigasi.",
};

export default async function SignUpPage({ searchParams }: PageProps<"/daftar">) {
  const returnTo = firstParam((await searchParams)[RETURN_PARAM]);
  return (
    <AuthShell
      title="Daftar"
      description="Buat akun untuk menyimpan kasus, laporan, dan catatan investigasi."
      footer={
        <>
          Sudah punya akun?{" "}
          <Link href={authHref("/masuk", returnTo)} className="font-medium text-accent hover:underline">
            Masuk
          </Link>
        </>
      }
    >
      <SignUpForm next={safeReturnPath(returnTo)} />
    </AuthShell>
  );
}
