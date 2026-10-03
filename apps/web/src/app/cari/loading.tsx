import { PanelSkeleton } from "@/components/ui/panel-skeleton";
import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <p role="status" className="sr-only">
        Mencari…
      </p>
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-5">
        <div className="min-w-0 space-y-2 lg:col-span-3">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-[72px] w-full rounded-lg" />
          ))}
        </div>
        <div className="min-w-0 lg:col-span-2">
          <PanelSkeleton rows={4} />
        </div>
      </div>
    </main>
  );
}
