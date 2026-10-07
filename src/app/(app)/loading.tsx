import { Skeleton } from "@/components/ui/states";

/** Neutral placeholder only: it never claims progress that has not happened. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-48 lg:col-span-2" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
