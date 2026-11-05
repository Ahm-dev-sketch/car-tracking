'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  LocationUpdateData,
  BookingUpdateData,
  NotificationEventData,
  OfferEventData,
  ServerRealtimeEvent,
  ServerRealtimeMessage,
  ClientRealtimeMessage,
} from '@/types/realtime';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface UseRealtimeOptions {
  vehicleIds?: string[];
  token?: string;
  wsUrl?: string;
  onOffer?: (offer: OfferEventData) => void;
}

export interface UseRealtimeResult {
  vehicles: Map<string, LocationUpdateData>;
  bookings: Map<string, BookingUpdateData>;
  notifications: NotificationEventData[];
  offers: Map<string, OfferEventData>;
  lastEvent: ServerRealtimeEvent | null;
  connectionState: ConnectionState;
  send: (msg: ClientRealtimeMessage) => void;
}

export function useRealtime({
  vehicleIds = [],
  token: customToken,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
  onOffer,
}: UseRealtimeOptions = {}): UseRealtimeResult {
  const { data: session } = useSession();
  const tokenSession = session as (typeof session & { token?: string; user?: { token?: string } });
  const effectiveToken = customToken || tokenSession?.token || tokenSession?.user?.token || '';
  const role = session?.user?.role;
  const userId = session?.user?.id;
  const subscriptionKey = JSON.stringify([...new Set(vehicleIds)].sort());

  const [vehicles, setVehicles] = useState<Map<string, LocationUpdateData>>(() => new Map());
  const [bookings, setBookings] = useState<Map<string, BookingUpdateData>>(() => new Map());
  const [notifications, setNotifications] = useState<NotificationEventData[]>([]);
  const [offers, setOffers] = useState<Map<string, OfferEventData>>(() => new Map());
  const [lastEvent, setLastEvent] = useState<ServerRealtimeEvent | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('closed');
  const wsRef = useRef<WebSocket | null>(null);
  const onOfferRef = useRef(onOffer);

  useEffect(() => {
    onOfferRef.current = onOffer;
  }, [onOffer]);

  const send = useCallback((msg: ClientRealtimeMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const ids: string[] = JSON.parse(subscriptionKey);

    function connect() {
      if (disposed || !effectiveToken) return;
      setConnectionState(attempt === 0 ? 'connecting' : 'reconnecting');
      try {
        const ws = new WebSocket(wsUrl);
        socket = ws;
        wsRef.current = ws;
        ws.onopen = () => {
          if (disposed || socket !== ws) return;
          ws.send(JSON.stringify({ type: 'auth', token: effectiveToken }));
        };
        ws.onmessage = (event) => {
          if (disposed || socket !== ws) return;
          try {
            const message: ServerRealtimeMessage = JSON.parse(event.data);
            if (message.type === 'auth:success') {
              attempt = 0;
              setConnectionState('open');
              if (message.role === 'ADMIN') {
                ws.send(JSON.stringify({ type: 'subscribe', all: true }));
              } else if (ids.length > 0) {
                ws.send(JSON.stringify({ type: 'subscribe', vehicles: ids }));
              }
              return;
            }
            if (message.type === 'location:update') {
              setVehicles((prev) => {
                const previous = prev.get(message.data.vehicleId);
                if (previous && Date.parse(previous.recordedAt) >= Date.parse(message.data.recordedAt)) return prev;
                return new Map(prev).set(message.data.vehicleId, message.data);
              });
              setLastEvent(message);
            } else if (message.type === 'booking:update') {
              setBookings((prev) => new Map(prev).set(message.data.bookingId, message.data));
              setLastEvent(message);
            } else if (message.type === 'notification') {
              setNotifications((prev) => [message.data, ...prev]);
              setLastEvent(message);
            } else if (message.type === 'offer') {
              setOffers((prev) => new Map(prev).set(message.data.offerId, message.data));
              onOfferRef.current?.(message.data);
              setLastEvent(message);
            }
          } catch {
            // Ignore invalid incoming payloads.
          }
        };
        ws.onclose = (event: CloseEvent) => {
          if (disposed || socket !== ws) return;
          socket = null;
          wsRef.current = null;
          setConnectionState('closed');
          if (event?.code === 4001) return;
          const delay = Math.min(30000, 1000 * Math.pow(1.5, attempt++));
          timer = setTimeout(connect, delay);
        };
        ws.onerror = () => {
          // The close handler schedules reconnection.
        };
      } catch {
        setConnectionState('closed');
      }
    }

    queueMicrotask(() => {
      if (disposed) return;
      setVehicles(new Map());
      setBookings(new Map());
      setNotifications([]);
      setOffers(new Map());
      setLastEvent(null);
      setConnectionState('closed');
      connect();
    });

    return () => {
      disposed = true;
      clearTimeout(timer);
      if (wsRef.current === socket) wsRef.current = null;
      socket?.close();
    };
    // Subscriptions are additive on the server: reconnect to remove old scope,
    // including when the vehicle list becomes empty or the account changes.
  }, [effectiveToken, wsUrl, subscriptionKey, role, userId]);

  return { vehicles, bookings, notifications, offers, lastEvent, connectionState, send };
}
