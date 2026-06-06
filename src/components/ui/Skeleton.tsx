"use client";

export function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-surface-primary p-6 border border-strong shadow-sm animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-20 rounded bg-surface-3" />
        <div className="h-10 w-10 rounded-xl bg-surface-3" />
      </div>
      <div className="mt-4 h-8 w-16 rounded bg-surface-3" />
    </div>
  );
}

export function SkeletonTable({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-surface-primary rounded-2xl border border-strong shadow-sm overflow-hidden animate-pulse">
      <div className="border-b border-base bg-surface-1/50 px-6 py-3 flex gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 w-16 rounded bg-surface-3" />
        ))}
      </div>
      <div className="divide-y divide-surface-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-6 py-4 flex gap-6">
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className="h-4 rounded bg-surface-2"
                style={{ width: `${60 + ((i * cols + j) % 4) * 12}px` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
