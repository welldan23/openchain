import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <p role="status" className="sr-only">
        Memuat riwayat investigasi…
      </p>
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {Array.from({ length: 2 }, (_, group) => (
        <div key={group} className="space-y-3">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
              <Skeleton className="mt-3.5 ml-auto h-3 w-10" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}
