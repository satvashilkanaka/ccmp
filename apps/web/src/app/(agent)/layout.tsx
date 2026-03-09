'use client';

import React from 'react';
import Softphone from '../../components/telephony/Softphone';
import { useSession } from 'next-auth/react';
import { useRealtimeConnection } from '../../hooks/useRealtimeConnection';
import { ReconnectingBanner } from '../../components/ReconnectingBanner';

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken ?? '';
  const { isReconnecting } = useRealtimeConnection(token);

  return (
    <div>
      <ReconnectingBanner isReconnecting={isReconnecting} />
      {children}
      {/* Softphone is always present when agent is logged in */}
      <Softphone />
    </div>
  );
}
