'use client';

import React, { useState, useCallback, useRef } from 'react';
import { MessageSquare, Phone } from 'lucide-react';
import { ChatDrawer } from '@/components/chat/ChatDrawer';
import { VoiceCallModal } from '@/components/call/VoiceCallModal';
import { useWebRTCCall, CallLogEntry } from '@/hooks/useWebRTCCall';
import { useRealtimeChat } from '@/hooks/useRealtimeChat';

interface TripCommunicationWidgetProps {
  bookingId?: string | null;
  tripId?: string | null;
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: 'USER' | 'DRIVER' | 'ADMIN';
  partnerId?: string | null;
  partnerName: string;
  partnerRole?: string;
  variant?: 'buttons' | 'floating' | 'bar';
}

export function TripCommunicationWidget({
  bookingId,
  tripId,
  currentUserId,
  currentUserName,
  currentUserRole = 'USER',
  partnerId,
  partnerName,
  partnerRole = 'Driver',
  variant = 'buttons',
}: TripCommunicationWidgetProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);

  const channelId = bookingId ? `booking-${bookingId}` : tripId ? `trip-${tripId}` : 'general';

  // Single Realtime Chat Hook instance
  const {
    messages,
    isLoading,
    isSending,
    error,
    unreadCount,
    sendMessage,
    clearUnread,
  } = useRealtimeChat({
    bookingId,
    tripId,
    currentUserId,
    currentUserName,
    currentUserRole,
    isOpen: isChatOpen,
  });

  // Log voice call events to chat history & database call log
  const handleLogCall = useCallback(
    async (entry: CallLogEntry, targetPartnerId?: string | null) => {
      const partner = targetPartnerId || partnerId;
      let text = '';
      if (entry.type === 'COMPLETED') {
        const mins = Math.floor(entry.durationSeconds / 60);
        const secs = entry.durationSeconds % 60;
        const durStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        text = `Panggilan Suara Berakhir (${durStr})`;
      } else if (entry.type === 'MISSED') {
        text = 'Panggilan suara tak terjawab';
      } else {
        text = 'Panggilan Ditolak';
      }

      try {
        const res = await fetch('/api/call/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId,
            tripId,
            receiverId: partner,
            status: entry.type,
            durationSeconds: entry.durationSeconds,
            message: text,
          }),
        });
        if (!res.ok) {
          throw new Error('Call log API failed');
        }
      } catch {
        sendMessage(text, partner);
      }
    },
    [bookingId, tripId, partnerId, sendMessage]
  );

  // WebRTC Call Hook & Audio Ref
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const {
    callStatus,
    isMuted,
    callDuration,
    partnerInfo,
    errorMessage,
    remoteStream,
    missedCallsCount,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    clearMissedCalls,
  } = useWebRTCCall({
    channelId,
    currentUserId,
    currentUserName,
    currentUserRole,
    remoteAudioRef,
    onLogCall: handleLogCall,
  });

  const handleStartCall = () => {
    if (!partnerId) return;
    clearMissedCalls();
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.play().catch(() => {});
    }
    if (typeof window !== 'undefined') {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
        }
      } catch {}
    }
    startCall(partnerId, partnerName, partnerRole);
  };

  const handleOpenChat = () => {
    clearUnread();
    setIsChatOpen(true);
  };

  return (
    <>
      {/* Buttons */}
      {variant === 'buttons' && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenChat}
            className="button-secondary relative px-3.5 py-2 text-[0.6875rem]"
          >
            <MessageSquare className="size-3.5 text-[var(--kcic-red)]" strokeWidth={2} aria-hidden="true" />
            <span>Chat in-app</span>
            {unreadCount > 0 && (
              <span className="count-badge ml-0.5">{unreadCount}</span>
            )}
          </button>

          {partnerId && (
            <button
              type="button"
              onClick={handleStartCall}
              className="button-primary relative px-3.5 py-2 text-[0.6875rem]"
            >
              <Phone className="size-3.5" strokeWidth={2} aria-hidden="true" />
              <span>Telepon</span>
              {missedCallsCount > 0 && (
                <span className="ml-0.5 inline-flex h-4 min-w-4 animate-pulse items-center justify-center rounded-full bg-[var(--status-error-fg)] px-1 text-[0.625rem] font-semibold tabular-nums text-white">
                  {missedCallsCount}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Floating — sits above the mobile dock, never over content */}
      {variant === 'floating' && (
        <div
          className="fixed right-4 z-40 flex flex-col gap-2"
          style={{ bottom: 'calc(var(--mobile-nav-space) + 0.75rem)' }}
        >
          {partnerId && (
            <button
              type="button"
              onClick={handleStartCall}
              title={`Telepon ${partnerName}`}
              aria-label={`Telepon ${partnerName}`}
              className="relative grid size-11 cursor-pointer place-items-center rounded-full bg-[var(--slate-navy)] text-white shadow-[var(--shadow-lg)] transition-colors hover:bg-[var(--charcoal)]"
            >
              <Phone className="size-5" strokeWidth={1.9} aria-hidden="true" />
              {missedCallsCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex size-4.5 animate-pulse items-center justify-center rounded-full bg-[var(--status-error-fg)] px-1 text-[0.625rem] font-semibold tabular-nums text-white">
                  {missedCallsCount}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenChat}
            title={`Chat dengan ${partnerName}`}
            aria-label={`Chat dengan ${partnerName}`}
            className="relative grid size-11 cursor-pointer place-items-center rounded-full bg-[var(--kcic-red)] text-white shadow-[var(--shadow-lg)] transition-colors hover:bg-[var(--kcic-red-hover)]"
          >
            <MessageSquare className="size-5" strokeWidth={1.9} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 inline-flex size-4.5 items-center justify-center rounded-full bg-[var(--slate-navy)] px-1 text-[0.625rem] font-semibold tabular-nums text-white">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Bar */}
      {variant === 'bar' && (
        <div className="flex w-full flex-wrap items-center justify-between gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="icon-tile-accent">
              <MessageSquare className="size-4" strokeWidth={1.9} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-900">Komunikasi armada</p>
              <p className="truncate text-[0.6875rem] text-slate-500">Terhubung dengan {partnerName}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={handleOpenChat} className="button-secondary px-3 py-1.5 text-[0.6875rem]">
              <span>Chat</span>
              {unreadCount > 0 && <span className="count-badge">{unreadCount}</span>}
            </button>
            {partnerId && (
              <button type="button" onClick={handleStartCall} className="button-primary px-3 py-1.5 text-[0.6875rem]">
                <Phone className="size-3.5" strokeWidth={2} aria-hidden="true" />
                <span>Panggil</span>
                {missedCallsCount > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-error-fg)] px-1 text-[0.625rem] font-semibold tabular-nums text-white">
                    {missedCallsCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Real-time chat */}
      <ChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        bookingId={bookingId}
        tripId={tripId}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        currentUserRole={currentUserRole}
        partnerId={partnerId}
        partnerName={partnerName}
        partnerRole={partnerRole}
        messages={messages}
        isLoading={isLoading}
        isSending={isSending}
        error={error}
        sendMessage={sendMessage}
        onStartCall={() => {
          setIsChatOpen(false);
          handleStartCall();
        }}
      />

      {/* WebRTC voice call */}
      <VoiceCallModal
        callStatus={callStatus}
        isMuted={isMuted}
        callDuration={callDuration}
        partnerName={partnerInfo?.name || partnerName}
        partnerRole={partnerInfo?.role || partnerRole}
        errorMessage={errorMessage}
        remoteStream={remoteStream}
        audioRef={remoteAudioRef}
        onAccept={acceptCall}
        onReject={rejectCall}
        onEndCall={() => endCall('COMPLETED')}
        onToggleMute={toggleMute}
      />
    </>
  );
}
