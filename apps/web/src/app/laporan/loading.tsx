import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <p role="status" className="sr-only">
        Memuat laporan…
      </p>
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      {[0, 1].map((key) => (
        <div key={key} className="space-y-3 rounded-xl border border-line bg-surface p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </main>
  );
}
