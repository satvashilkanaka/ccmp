'use client';

import React from 'react';

/**
 * Skeleton loader for the RecordingPlayer.
 */
export function PlayerSkeleton() {
  return (
    <div className="w-full h-16 bg-slate-200 animate-pulse rounded-lg flex items-center px-4 gap-4">
      <div className="w-8 h-8 bg-slate-300 rounded-full" />
      <div className="flex-1 h-2 bg-slate-300 rounded" />
      <div className="w-12 h-4 bg-slate-300 rounded" />
    </div>
  );
}
