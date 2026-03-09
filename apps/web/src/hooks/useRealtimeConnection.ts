'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socket } from '../lib/socket';

/**
 * Manages the Socket.IO connection lifecycle with:
 * - Exponential backoff (already set in socket.ts: reconnectionDelayMax=30s, randomizationFactor=0.5)
 * - React Query cache invalidation on reconnect (prevents stale data after disconnect)
 * - "Reconnecting..." banner state exposed to the UI
 */
export function useRealtimeConnection(token: string) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const invalidateAllCaches = useCallback(() => {
    queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    if (!token) return;

    // Set auth token on the global socket instance
    socket.auth = { token };

    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => {
      setIsConnected(true);
      setIsReconnecting(false);
    };

    const onDisconnect = (reason: string) => {
      setIsConnected(false);
      // If the server closed the connection, Socket.IO won't auto-reconnect unless we tell it to
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    };

    const onConnectError = () => {
      setIsReconnecting(true);
    };

    const onReconnectAttempt = () => {
      setIsReconnecting(true);
    };

    const onReconnect = () => {
      setIsReconnecting(false);
      setIsConnected(true);
      // Invalidate ALL React Query caches — stale data must not persist after reconnect
      invalidateAllCaches();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect', onReconnect);

    // Sync initial state
    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('reconnect', onReconnect);
    };
  }, [token, invalidateAllCaches]);

  return { isConnected, isReconnecting };
}
