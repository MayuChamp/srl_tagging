import React from "react";
import { Plus } from "lucide-react";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="page space-y-8">
      <span className="sr-only">Loading…</span>

      {/* Header Skeleton */}
      <div className="page-header">
        <div className="space-y-2">
          <div className="h-8 md:h-9 w-56 sm:w-64 max-w-full rounded-lg bg-secondary shimmer" />
          <div className="h-4 w-48 max-w-full rounded-md bg-secondary/60 shimmer" />
        </div>
        <div className="h-9 w-36 rounded-[0.625rem] bg-secondary shimmer" />
      </div>

      {/* Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-5 h-38 flex flex-col justify-between shimmer">
            <div className="w-10 h-10 rounded-xl bg-background/50" />
            <div className="h-8 w-16 bg-background/50 rounded-md" />
          </div>
        ))}
      </div>

      {/* Video Section Skeleton */}
      <div className="card overflow-hidden h-[450px] shimmer">
        <div className="h-[4.25rem] border-b border-border bg-background/20" />
        <div className="p-4 h-[380px] bg-background/10" />
      </div>

      {/* Charts Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card h-[400px] shimmer" />
        <div className="card h-[400px] shimmer" />
      </div>
    </div>
  );
}
