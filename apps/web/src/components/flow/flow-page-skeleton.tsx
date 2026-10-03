import { PanelSkeleton } from "@/components/ui/panel-skeleton";
import { Skeleton } from "@/components/ui/states";

/** Kerangka halaman aliran dana selama datanya dimuat. */
export function FlowPageSkeleton() {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8"
    >
      <p role="status" className="sr-only">
        Memuat aliran dana…
      </p>

      <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-56 max-w-full" />
            <div className="flex gap-1.5">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-4 w-28 rounded-full" />
            </div>
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
        </div>
        <Skeleton className="mt-4 h-8 w-full rounded-lg" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="space-y-2 rounded-xl border border-line bg-surface px-4 py-3">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>

      <PanelSkeleton rows={2} />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <PanelSkeleton rows={4} />
        </div>
        <div className="min-w-0">
          <PanelSkeleton rows={2} />
        </div>
      </div>
    </main>
  );
}
