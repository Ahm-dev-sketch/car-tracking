'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ChatDrawer } from '@/components/chat/ChatDrawer';
import { VoiceCallModal } from '@/components/call/VoiceCallModal';
import { useWebRTCCall, CallLogEntry } from '@/hooks/useWebRTCCall';
import { useRealtimeChat } from '@/hooks/useRealtimeChat';
import { useTranslation } from '@/components/providers/LanguageProvider';

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
  const { t, format } = useTranslation();
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
      // Call entries are plain text; ChatDrawer renders them with a phone Icon.
      let text = '';
      if (entry.type === 'COMPLETED') {
        const mins = Math.floor(entry.durationSeconds / 60);
        const secs = entry.durationSeconds % 60;
        const durStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        text = format(t.comms.callLogCompleted, { duration: durStr });
      } else if (entry.type === 'MISSED') {
        text = t.comms.callLogMissed;
      } else {
        text = t.comms.callLogRejected;
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
        // Fallback: send directly through client realtime chat message hook
        sendMessage(text, partner);
      }
    },
    [bookingId, tripId, partnerId, sendMessage, format, t.comms.callLogCompleted, t.comms.callLogMissed, t.comms.callLogRejected]
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

  /* Count badges: a quiet crimson dot for messages, danger red only for missed calls */
  const countBadge =
    'flex min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold tabular-nums';

  return (
    <>
      {/* Communication Buttons Presentation */}
      {variant === 'buttons' && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Chat Button */}
          <button
            type="button"
            onClick={handleOpenChat}
            className="relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <Icon name="message" className="size-4 text-brand-600" />
            <span>{t.comms.inAppChat}</span>
            {unreadCount > 0 && (
              <span className={`${countBadge} bg-brand-600 text-white`}>
                {unreadCount}
              </span>
            )}
          </button>

          {/* Voice Call Button */}
          {partnerId && (
            <button
              type="button"
              onClick={handleStartCall}
              className="relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <Icon name="phone" className="size-4" />
              <span>{t.comms.inAppCall}</span>
              {missedCallsCount > 0 && (
                <span className={`${countBadge} bg-danger-600 text-white`}>
                  {missedCallsCount}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Floating Presentation */}
      {variant === 'floating' && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2.5">
          {partnerId && (
            <button
              type="button"
              onClick={handleStartCall}
              title={format(t.comms.callTooltip, { name: partnerName })}
              className="relative flex size-12 cursor-pointer items-center justify-center rounded-full bg-slate-900 text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <Icon name="phone" className="size-5" />
              {missedCallsCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-white bg-danger-600 font-mono text-[10px] font-semibold tabular-nums text-white">
                  {missedCallsCount}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenChat}
            title={format(t.comms.chatTooltip, { name: partnerName })}
            className="relative flex size-12 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <Icon name="message" className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-white bg-white font-mono text-[10px] font-semibold tabular-nums text-brand-700">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Bar Presentation */}
      {variant === 'bar' && (
        <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Icon name="message" className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-900">{t.comms.fleetComms}</p>
              <p className="truncate text-[11px] font-medium text-slate-500">{format(t.comms.connectedWith, { name: partnerName })}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenChat}
              className="relative inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <span>{t.comms.chatBtn}</span>
              {unreadCount > 0 && (
                <span className={`${countBadge} bg-brand-600 text-white`}>
                  {unreadCount}
                </span>
              )}
            </button>
            {partnerId && (
              <button
                type="button"
                onClick={handleStartCall}
                className="relative inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
              >
                <Icon name="phone" className="size-3.5" />
                <span>{t.comms.callBtn}</span>
                {missedCallsCount > 0 && (
                  <span className={`${countBadge} bg-danger-600 text-white`}>
                    {missedCallsCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Real-time Chat Drawer */}
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

      {/* WebRTC Voice Call Modal Overlay */}
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
