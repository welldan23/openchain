import Image from "next/image";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/settings";

/** Foto profil, atau inisial nama bila belum ada foto. */
export function ProfileAvatar({ name, url, className }: { name: string; url: string | null; className?: string }) {
  if (url) {
    // Foto tiruan berupa URL lokal di browser, jadi tidak lewat optimasi gambar Next.
    return <Image src={url} alt={`Foto profil ${name}`} width={56} height={56} unoptimized className={cn("size-14 shrink-0 rounded-full object-cover ring-1 ring-accent/30", className)} />;
  }
  return (
    <span aria-hidden className={cn("grid size-14 shrink-0 place-items-center rounded-full bg-accent/15 text-lg font-semibold text-accent ring-1 ring-accent/30", className)}>
      {initials(name)}
    </span>
  );
}
