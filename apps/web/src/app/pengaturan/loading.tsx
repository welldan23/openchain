import { Skeleton } from "@/components/ui/states";

/** Hanya isi tab yang dimuat ulang; judul dan tab tetap di layout. */
export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <p role="status" className="sr-only">
        Memuat pengaturan…
      </p>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}
