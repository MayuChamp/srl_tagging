import React from "react";
import { Plus } from "lucide-react";

export default function Loading() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-8 w-64 rounded-lg bg-secondary shimmer" />
          <div className="h-4 w-48 rounded-md bg-secondary/60 shimmer" />
        </div>
        <div className="h-10 w-36 rounded-xl bg-secondary shimmer" />
      </div>

      {/* Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-5 h-32 flex flex-col justify-between shimmer">
            <div className="w-10 h-10 rounded-xl bg-background/50" />
            <div className="h-8 w-16 bg-background/50 rounded-md" />
          </div>
        ))}
      </div>

      {/* Video Section Skeleton */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden h-[450px] shimmer">
        <div className="h-14 border-b border-border/50 bg-background/20" />
        <div className="p-4 h-[394px] bg-background/10" />
      </div>

      {/* Charts Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl h-[400px] shimmer" />
        <div className="bg-card border border-border rounded-2xl h-[400px] shimmer" />
      </div>
    </div>
  );
}
