import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Masuk",
  description: "Masuk untuk menyimpan kasus, laporan, dan catatan investigasi.",
};

export default function SignInPage() {
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
      <SignInForm />
    </AuthShell>
  );
}
