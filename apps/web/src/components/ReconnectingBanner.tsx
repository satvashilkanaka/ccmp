'use client';

/**
 * Shown when the Socket.IO connection drops and the client is attempting to reconnect.
 * Positioned fixed at the top of the screen so it's always visible.
 */
export function ReconnectingBanner({ isReconnecting }: { isReconnecting: boolean }) {
  if (!isReconnecting) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 shadow-md"
    >
      <svg
        className="h-4 w-4 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      Reconnecting to server — your data is paused...
    </div>
  );
}
