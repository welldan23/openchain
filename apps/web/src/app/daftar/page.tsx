import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Daftar",
  description: "Buat akun untuk menyimpan kasus, laporan, dan catatan investigasi.",
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="Daftar"
      description="Buat akun untuk menyimpan kasus, laporan, dan catatan investigasi."
      footer={
        <>
          Sudah punya akun?{" "}
          <Link href="/masuk" className="font-medium text-accent hover:underline">
            Masuk
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
