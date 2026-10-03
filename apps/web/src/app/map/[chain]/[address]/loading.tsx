import { PanelSkeleton } from "@/components/ui/panel-skeleton";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8"
    >
      <p role="status" className="sr-only">
        Memuat peta hubungan…
      </p>
      <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-6 w-64 max-w-full" />
            <Skeleton className="h-4 w-20 rounded-full" />
          </div>
        </div>
        <Skeleton className="mt-4 h-8 w-full rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2 rounded-xl border border-line bg-surface px-4 py-3">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-line bg-surface p-4 lg:col-span-2">
          <Skeleton className="aspect-[3/2] w-full rounded-lg" />
        </div>
        <PanelSkeleton rows={3} />
      </div>
    </main>
  );
}
