'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { useRealtimeConnection } from '../../hooks/useRealtimeConnection';
import { ReconnectingBanner } from '../../components/ReconnectingBanner';

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken ?? '';
  const { isReconnecting } = useRealtimeConnection(token);

  return (
    <div className="min-h-screen bg-slate-950">
      <ReconnectingBanner isReconnecting={isReconnecting} />
      {children}
    </div>
  );
}
