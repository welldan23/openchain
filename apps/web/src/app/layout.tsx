import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { SearchOriginBar } from "@/components/search/search-origin-bar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "OpenChain Intelligence",
    template: "%s · OpenChain Intelligence",
  },
  description:
    "Multichain wallet tracing, token due diligence, fund-flow analysis, risk intelligence, and evidence-backed reporting.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <AppHeader />
        {/* Membaca ?cari= di browser; Suspense supaya halaman statis tetap bisa dirender saat build. */}
        <Suspense fallback={null}>
          <SearchOriginBar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
