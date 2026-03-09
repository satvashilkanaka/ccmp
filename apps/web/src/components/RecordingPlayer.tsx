'use client';

import React from 'react';

/**
 * A basic audio player component that can be lazily loaded.
 */
export default function RecordingPlayer({ src }: { src: string }) {
  return (
    <audio controls className="w-full rounded-lg shadow-inner bg-slate-50 p-2">
      <source src={src} type="audio/wav" />
      Your browser does not support the audio element.
    </audio>
  );
}
