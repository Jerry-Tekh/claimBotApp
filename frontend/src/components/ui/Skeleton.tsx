// frontend/src/components/ui/Skeleton.tsx

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`skeleton-shimmer ${className}`} />
  );
}

export function PolicySkeleton() {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-2.5 w-40 sm:w-64" />
            <Skeleton className="h-2 w-28" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="space-y-1.5 text-right">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="card p-5 space-y-2.5">
      <Skeleton className="h-3 w-24 rounded-md" />
      <Skeleton className="h-7 w-32 rounded-lg" />
    </div>
  );
}

export function TreasurySkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <StatCardSkeleton key={i} />)}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6 space-y-4">
          <Skeleton className="h-4 w-36 rounded-md" />
          <Skeleton className="h-3 w-full rounded-full" />
          <div className="space-y-2.5">
            {[1,2,3].map(i => <Skeleton key={i} className="h-3.5 w-full rounded-md" />)}
          </div>
        </div>
        <div className="card p-6 flex items-center justify-center">
          <Skeleton className="w-44 h-44 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ClaimRowSkeleton() {
  return (
    <div className="bg-white border border-ink-100 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-2.5 w-20 rounded-md" />
          <Skeleton className="h-2.5 w-52 rounded-md" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-12 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}
