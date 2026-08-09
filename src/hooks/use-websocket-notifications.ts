'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';

interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  link?: string | null;
  createdAt: string;
}

/**
 * WebSocket hook for real-time notifications.
 *
 * Connects to the notifications mini-service (port 3003) via the Caddy
 * gateway. Automatically authenticates with the NextAuth JWT token.
 *
 * Falls back gracefully if the WS service is not running — the UI
 * continues to work with 30s polling.
 */
export function useWebSocketNotifications() {
  const { data: session, status } = useSession();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastNotification, setLastNotification] = useState<NotificationPayload | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) return;

    // Get the JWT token from NextAuth session
    // The token is stored in the cookie; we need to fetch it via the session endpoint
    // For WebSocket auth, we pass the session token
    const token = (session as any).token || (session as any).user?.id;

    const socket = io('/?XTransformPort=3003', {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      console.log('[ws] Connected to notifications service');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      console.log('[ws] Disconnected');
    });

    socket.on('connect_error', (err) => {
      setConnected(false);
      // Silent — fallback to polling
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ws] Connection error:', err.message);
      }
    });

    socket.on('notification:new', (notification: NotificationPayload) => {
      setLastNotification(notification);
      // Invalidate notifications query to refetch from DB
      qc.invalidateQueries({ queryKey: ['notifications'] });
    });

    socket.on('workflow:update', () => {
      qc.invalidateQueries({ queryKey: ['workflows'] });
    });

    socket.on('audit:alert', () => {
      qc.invalidateQueries({ queryKey: ['admin-anomalies'] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session, status, qc]);

  return { connected, lastNotification };
}
