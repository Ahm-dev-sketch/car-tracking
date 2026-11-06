'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { sounds } from '@/lib/sound-effects';

export interface ChatMessage {
  id: string;
  booking_id?: string | null;
  trip_id?: string | null;
  sender_id: string;
  sender_name?: string | null;
  sender_role?: 'USER' | 'DRIVER' | 'ADMIN' | string;
  receiver_id?: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface UseRealtimeChatProps {
  bookingId?: string | null;
  tripId?: string | null;
  currentUserId: string;
  currentUserName?: string;
  currentUserRole?: 'USER' | 'DRIVER' | 'ADMIN';
  isOpen?: boolean;
}

export function useRealtimeChat({
  bookingId,
  tripId,
  currentUserId,
  currentUserName = 'User',
  currentUserRole = 'USER',
  isOpen = false,
}: UseRealtimeChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const channelKey = bookingId ? `booking-${bookingId}` : tripId ? `trip-${tripId}` : null;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  // Clear unread when chat opens
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  // Load message history from API
  useEffect(() => {
    if (!channelKey) return;

    let isMounted = true;
    setIsLoading(true);

    const fetchHistory = async () => {
      try {
        const params = new URLSearchParams();
        if (bookingId) params.set('bookingId', bookingId);
        if (tripId) params.set('tripId', tripId);

        const res = await fetch(`/api/chat/messages?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          if (isMounted) {
            const rawList = json.data || [];
            // Normalize field names
            const normalized: ChatMessage[] = rawList.map((m: any) => ({
              id: m.id || m.id?.toString(),
              booking_id: m.booking_id ?? m.bookingId,
              trip_id: m.trip_id ?? m.tripId,
              sender_id: m.sender_id ?? m.senderId,
              sender_name: m.sender_name ?? m.senderName,
              sender_role: m.sender_role ?? m.senderRole,
              receiver_id: m.receiver_id ?? m.receiverId,
              message: m.message,
              is_read: m.is_read ?? m.isRead ?? false,
              created_at: m.created_at ?? m.createdAt ?? new Date().toISOString(),
            }));
            setMessages(normalized);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Gagal memuat riwayat percakapan');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [channelKey, bookingId, tripId]);

  // Handle incoming message deduplication
  const appendMessage = useCallback((msg: any) => {
    const normalized: ChatMessage = {
      id: msg.id || `local-${Date.now()}-${Math.random()}`,
      booking_id: msg.booking_id ?? msg.bookingId,
      trip_id: msg.trip_id ?? msg.tripId,
      sender_id: msg.sender_id ?? msg.senderId,
      sender_name: msg.sender_name ?? msg.senderName,
      sender_role: msg.sender_role ?? msg.senderRole,
      receiver_id: msg.receiver_id ?? msg.receiverId,
      message: msg.message,
      is_read: msg.is_read ?? msg.isRead ?? false,
      created_at: msg.created_at ?? msg.createdAt ?? new Date().toISOString(),
    };

    setMessages((prev) => {
      if (prev.some((m) => m.id === normalized.id)) {
        return prev;
      }
      return [...prev, normalized];
    });

    // Play sound and increment unread count if received from others
    if (normalized.sender_id !== currentUserId) {
      sounds.playMessageReceived();
      if (!isOpenRef.current) {
        setUnreadCount((c) => c + 1);
      }
    }
  }, [currentUserId]);

  // Real-time listener: Supabase WebSocket (Broadcast + Postgres Changes)
  useEffect(() => {
    if (!channelKey) return;

    const channelName = `chat:${channelKey}`;

    // Clean up any stale/existing channel on the same topic before subscribing
    const existing = supabase
      .getChannels()
      .find((c) => c.topic === `realtime:${channelName}` || c.topic === channelName);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase.channel(channelName);

    // 1. Zero-latency peer delivery via Supabase Broadcast
    channel.on('broadcast', { event: 'new-message' }, ({ payload }) => {
      appendMessage(payload);
    });

    // 2. Database changes via Postgres Realtime Replication
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'fleet_chat_messages',
        filter: bookingId ? `booking_id=eq.${bookingId}` : tripId ? `trip_id=eq.${tripId}` : undefined,
      },
      (payload) => {
        appendMessage(payload.new);
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelKey, bookingId, tripId, appendMessage]);

  // Send message
  const sendMessage = async (text: string, receiverId?: string | null) => {
    if (!text.trim() || isSending) return;

    setIsSending(true);
    setError(null);

    const payload = {
      bookingId: bookingId ?? null,
      tripId: tripId ?? null,
      receiverId: receiverId ?? null,
      message: text.trim(),
      senderName: currentUserName,
      senderRole: currentUserRole,
    };

    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Gagal mengirim pesan');
      }

      const json = await res.json();
      if (json.data) {
        appendMessage(json.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kesalahan jaringan saat mengirim pesan');
    } finally {
      setIsSending(false);
    }
  };

  return {
    messages,
    isLoading,
    isSending,
    error,
    unreadCount,
    sendMessage,
    clearUnread: () => setUnreadCount(0),
  };
}
