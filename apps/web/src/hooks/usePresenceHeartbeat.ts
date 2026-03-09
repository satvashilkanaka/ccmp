'use client';
import { useEffect, useRef } from 'react';
import { socket } from '../lib/socket';

export function usePresenceHeartbeat(agentId: string | undefined) {
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!agentId || !socket) return;

    const sendHeartbeat = () => {
      try {
        socket.emit('agent:heartbeat', { agentId, ts: Date.now() });
      } catch (err) {
        console.warn('Heartbeat failed:', err);
      }
    };

    // Join agent room and send initial heartbeat
    try {
      socket.emit('agent:join', agentId);
      sendHeartbeat();
    } catch (err) {
      console.warn('Join failing:', err);
    }

    intervalRef.current = setInterval(sendHeartbeat, 30_000);

    return () => {
      clearInterval(intervalRef.current);
      try {
        socket.emit('presence:update', { agentId, status: 'OFFLINE' });
      } catch { /* ignore on cleanup */ }
    };
  }, [agentId]);
}
