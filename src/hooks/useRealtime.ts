'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  LocationUpdateData,
  BookingUpdateData,
  NotificationEventData,
  ServerRealtimeEvent,
  ServerRealtimeMessage,
  ClientRealtimeMessage,
} from '@/types/realtime';

export type ConnectionState =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed';

export interface UseRealtimeOptions {
  vehicleIds?: string[];
  token?: string;
  wsUrl?: string;
}

export interface UseRealtimeResult {
  vehicles: Map<string, LocationUpdateData>;
  bookings: Map<string, BookingUpdateData>;
  notifications: NotificationEventData[];
  lastEvent: ServerRealtimeEvent | null;
  connectionState: ConnectionState;
  send: (msg: ClientRealtimeMessage) => void;
}

export function useRealtime({
  vehicleIds = [],
  token: customToken,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
}: UseRealtimeOptions = {}): UseRealtimeResult {
  const { data: session } = useSession?.() ?? { data: null };

  const effectiveToken =
    customToken ||
    (session as any)?.token ||
    (session as any)?.user?.token ||
    '';
  const role = session?.user?.role;

  const [vehicles, setVehicles] = useState<Map<string, LocationUpdateData>>(
    () => new Map()
  );
  const [bookings, setBookings] = useState<Map<string, BookingUpdateData>>(
    () => new Map()
  );
  const [notifications, setNotifications] = useState<NotificationEventData[]>(
    []
  );
  const [lastEvent, setLastEvent] = useState<ServerRealtimeEvent | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('closed');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isMountedRef = useRef(false);

  const vehicleIdsRef = useRef(vehicleIds);
  vehicleIdsRef.current = vehicleIds;

  const roleRef = useRef(role);
  roleRef.current = role;

  const tokenRef = useRef(effectiveToken);
  tokenRef.current = effectiveToken;

  const send = useCallback((msg: ClientRealtimeMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    if (typeof window === 'undefined' || !isMountedRef.current) return;
    if (!tokenRef.current) {
      setConnectionState('closed');
      return;
    }

    setConnectionState((prev) =>
      prev === 'connecting' || prev === 'open' ? prev : 'reconnecting'
    );

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        reconnectAttemptRef.current = 0;
        setConnectionState('open');

        // 1. Send authentication handshake
        ws.send(JSON.stringify({ type: 'auth', token: tokenRef.current }));
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;

        try {
          const message: ServerRealtimeMessage = JSON.parse(event.data);

          if (message.type === 'auth:success') {
            // 2. Resubscribe upon successful auth
            const isAdmin = roleRef.current === 'ADMIN' || message.role === 'ADMIN';
            if (isAdmin) {
              ws.send(JSON.stringify({ type: 'subscribe', all: true }));
            } else if (vehicleIdsRef.current.length > 0) {
              ws.send(
                JSON.stringify({
                  type: 'subscribe',
                  vehicles: vehicleIdsRef.current,
                })
              );
            }
            return;
          }

          if (message.type === 'location:update') {
            setVehicles((prev) => {
              const next = new Map(prev);
              next.set(message.data.vehicleId, message.data);
              return next;
            });
            setLastEvent(message);
          } else if (message.type === 'booking:update') {
            setBookings((prev) => {
              const next = new Map(prev);
              next.set(message.data.bookingId, message.data);
              return next;
            });
            setLastEvent(message);
          } else if (message.type === 'notification') {
            setNotifications((prev) => [message.data, ...prev]);
            setLastEvent(message);
          }
        } catch {
          // Ignore invalid incoming payloads
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setConnectionState('closed');
        wsRef.current = null;

        // Auto-reconnect with exponential backoff (1s -> 30s cap)
        const delay = Math.min(
          30000,
          1000 * Math.pow(1.5, reconnectAttemptRef.current)
        );
        reconnectAttemptRef.current += 1;

        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connect();
          }
        }, delay);
      };

      ws.onerror = () => {
        // ws.onclose will be called immediately after
      };
    } catch {
      setConnectionState('closed');
    }
  }, [wsUrl]);

  useEffect(() => {
    isMountedRef.current = true;
    if (effectiveToken) {
      connect();
    } else {
      setConnectionState('closed');
    }

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [effectiveToken, connect]);

  // Resubscribe if vehicleIds prop changes on open connection
  useEffect(() => {
    if (
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN &&
      role !== 'ADMIN' &&
      vehicleIds.length > 0
    ) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', vehicles: vehicleIds }));
    }
  }, [vehicleIds, role]);

  return {
    vehicles,
    bookings,
    notifications,
    lastEvent,
    connectionState,
    send,
  };
}
