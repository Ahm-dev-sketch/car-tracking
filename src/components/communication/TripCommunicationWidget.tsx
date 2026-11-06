'use client';

import React, { useState, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
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

  // Log voice call events to chat history
  const handleLogCall = useCallback(
    (entry: CallLogEntry, targetPartnerId?: string | null) => {
      let text = '';
      if (entry.type === 'COMPLETED') {
        const mins = Math.floor(entry.durationSeconds / 60);
        const secs = entry.durationSeconds % 60;
        const durStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        text = `📞 Panggilan Suara Berakhir (${durStr})`;
      } else if (entry.type === 'MISSED') {
        text = '📞 Panggilan Tak Terjawab';
      } else {
        text = '📞 Panggilan Ditolak';
      }
      sendMessage(text, targetPartnerId || partnerId);
    },
    [partnerId, sendMessage]
  );

  // WebRTC Call Hook
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
    onLogCall: handleLogCall,
  });

  const handleStartCall = () => {
    if (!partnerId) return;
    clearMissedCalls();
    startCall(partnerId, partnerName, partnerRole);
  };

  const handleOpenChat = () => {
    clearUnread();
    setIsChatOpen(true);
  };

  return (
    <>
      {/* Communication Buttons Presentation */}
      {variant === 'buttons' && (
        <div className="flex items-center gap-2">
          {/* Chat Button */}
          <button
            type="button"
            onClick={handleOpenChat}
            className="relative flex items-center justify-center gap-2 rounded-xl border-2 border-black bg-white px-3.5 py-2 text-xs font-bold text-zinc-900 shadow-[2px_2px_0px_0px_#000] hover:bg-zinc-50 transition cursor-pointer active:translate-x-0.5 active:translate-y-0.5"
          >
            <Icon name="message" className="size-4 text-[#be123c]" />
            <span>Chat In-App</span>
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#be123c] px-1 text-[10px] font-black text-white animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Voice Call Button */}
          {partnerId && (
            <button
              type="button"
              onClick={handleStartCall}
              className="relative flex items-center justify-center gap-2 rounded-xl border-2 border-black bg-emerald-400 px-3.5 py-2 text-xs font-black text-black shadow-[2px_2px_0px_0px_#000] hover:bg-emerald-300 transition cursor-pointer active:translate-x-0.5 active:translate-y-0.5"
            >
              <Icon name="phone" className="size-4" />
              <span>Telepon In-App</span>
              {missedCallsCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white animate-pulse">
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
              title={`Telepon ${partnerName}`}
              className="relative flex h-12 w-12 items-center justify-center rounded-2xl border-2.5 border-black bg-emerald-400 text-black shadow-[4px_4px_0px_0px_#000] hover:bg-emerald-300 transition cursor-pointer active:translate-x-0.5 active:translate-y-0.5"
            >
              <Icon name="phone" className="size-5" />
              {missedCallsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-black bg-rose-600 text-[10px] font-black text-white animate-pulse">
                  {missedCallsCount}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenChat}
            title={`Chat dengan ${partnerName}`}
            className="relative flex h-12 w-12 items-center justify-center rounded-2xl border-2.5 border-black bg-[#be123c] text-white shadow-[4px_4px_0px_0px_#000] hover:bg-[#9f1239] transition cursor-pointer active:translate-x-0.5 active:translate-y-0.5"
          >
            <Icon name="message" className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-black bg-amber-400 text-[10px] font-black text-black">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Bar Presentation */}
      {variant === 'bar' && (
        <div className="flex w-full items-center justify-between rounded-xl border-2 border-black bg-white p-3 shadow-[3px_3px_0px_0px_#000]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-black bg-rose-100 text-[#be123c] font-black text-xs">
              <Icon name="message" className="size-4.5" />
            </div>
            <div>
              <p className="text-xs font-black text-zinc-950">Komunikasi Armada</p>
              <p className="text-[10px] text-zinc-500 font-medium">Terhubung dengan {partnerName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenChat}
              className="relative flex items-center gap-1.5 rounded-lg border-2 border-black bg-white px-2.5 py-1.5 text-xs font-bold hover:bg-zinc-100"
            >
              <span>Chat</span>
              {unreadCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#be123c] px-1 text-[9px] font-black text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            {partnerId && (
              <button
                type="button"
                onClick={handleStartCall}
                className="relative flex items-center gap-1.5 rounded-lg border-2 border-black bg-emerald-400 px-2.5 py-1.5 text-xs font-black text-black hover:bg-emerald-300"
              >
                <Icon name="phone" className="size-3.5" />
                <span>Panggil</span>
                {missedCallsCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white">
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
        onAccept={acceptCall}
        onReject={rejectCall}
        onEndCall={() => endCall('COMPLETED')}
        onToggleMute={toggleMute}
      />
    </>
  );
}
