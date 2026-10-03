import { PanelSkeleton } from "@/components/ui/panel-skeleton";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <p role="status" className="sr-only">
        Memuat kasus…
      </p>
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <PanelSkeleton rows={3} />
          <PanelSkeleton rows={3} />
        </div>
        <div className="min-w-0 space-y-5">
          <PanelSkeleton rows={2} />
          <PanelSkeleton rows={2} />
        </div>
      </div>
    </main>
  );
}
