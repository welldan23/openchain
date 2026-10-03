import { PanelSkeleton } from "@/components/ui/panel-skeleton";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8"
    >
      <p role="status" className="sr-only">
        Menelusuri jalur dana…
      </p>
      <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-6 w-72 max-w-full" />
            <Skeleton className="h-4 w-48 rounded-full" />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-20 flex-1 rounded-lg" />
          <Skeleton className="h-20 flex-1 rounded-lg" />
        </div>
      </div>
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
