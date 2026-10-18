"use client";

import { LogIn, LogOut, Settings, UserPlus, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { sessionLabel } from "@/lib/session";
import { endSession, useMockSession } from "@/lib/session-store";
import { authHref } from "@/lib/return-to";
import { initials } from "@/lib/settings";

const ITEM = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground/90 transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent";

/**
 * Tombol akun di header: menunjukkan status sesi (inisial dan titik hijau
 * bila sudah masuk) dan membuka menu berisi pengaturan, masuk/daftar, atau
 * keluar. Tutup dengan Escape (fokus kembali ke tombol) atau klik di luar.
 */
export function AccountMenu() {
  const session = useMockSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setOpen(false);
    await endSession();
    router.push("/masuk?keluar=1");
    router.refresh();
  }

  const checking = session === undefined;
  const label = checking ? "Akun" : sessionLabel(session);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative grid size-8 place-items-center rounded-lg ring-1 transition focus-visible:outline-2 focus-visible:outline-accent",
          session ? "bg-accent/15 text-[11px] font-semibold text-accent ring-accent/40" : "text-muted ring-line hover:text-accent hover:ring-accent/50",
        )}
      >
        {session ? initials(session.displayName) : <UserRound className="size-4" aria-hidden />}
        {session ? <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400 ring-2 ring-background" /> : null}
      </button>
      {open ? (
        <div id={menuId} className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-xl shadow-black/40">
          <div className="border-b border-line px-2.5 pb-2 pt-1.5">
            {session ? (
              <>
                <p className="flex items-center gap-1.5 text-xs text-emerald-300">
                  <span aria-hidden className="size-1.5 rounded-full bg-emerald-400" />
                  Sedang masuk
                </p>
                <p className="mt-1 truncate text-sm font-medium text-foreground">{session.displayName}</p>
                <p className="truncate text-xs text-muted">{session.email}</p>
                <p className="mt-1 text-[11px] text-muted">Sejak {formatDateTime(session.signedInAt)}</p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted">Belum masuk</p>
                <p className="mt-1 text-xs text-muted">Masuk untuk menyimpan kasus, laporan, dan catatan.</p>
              </>
            )}
          </div>
          <ul className="mt-1 space-y-0.5">
            {session ? null : (
              <>
                <li>
                  <Link href={authHref("/masuk", pathname)} onClick={() => setOpen(false)} className={ITEM}>
                    <LogIn className="size-4 text-accent" aria-hidden /> Masuk
                  </Link>
                </li>
                <li>
                  <Link href={authHref("/daftar", pathname)} onClick={() => setOpen(false)} className={ITEM}>
                    <UserPlus className="size-4 text-accent" aria-hidden /> Daftar
                  </Link>
                </li>
              </>
            )}
            <li>
              <Link href="/pengaturan" onClick={() => setOpen(false)} className={ITEM}>
                <Settings className="size-4 text-muted" aria-hidden /> Pengaturan
              </Link>
            </li>
            {session ? (
              <li>
                <button type="button" onClick={signOut} className={cn(ITEM, "text-rose-200 hover:text-rose-100")}>
                  <LogOut className="size-4" aria-hidden /> Keluar
                </button>
              </li>
            ) : null}
          </ul>
          <p className="mt-1 border-t border-line px-2.5 pt-2 text-[11px] text-muted">Sesi simulasi: hanya nama dan email yang disimpan di browser ini.</p>
        </div>
      ) : null}
    </div>
  );
}
