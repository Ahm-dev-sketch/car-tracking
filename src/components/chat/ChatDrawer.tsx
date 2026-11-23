'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check, MessageSquare, Phone, PhoneOff, Send, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useRealtimeChat } from '@/hooks/useRealtimeChat';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId?: string | null;
  tripId?: string | null;
  currentUserId: string;
  currentUserName?: string;
  currentUserRole?: 'USER' | 'DRIVER' | 'ADMIN';
  partnerId?: string | null;
  partnerName: string;
  partnerRole?: string;
  onStartCall?: (partnerId: string, partnerName: string, partnerRole?: string) => void;
  messages: ReturnType<typeof useRealtimeChat>['messages'];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  sendMessage: (text: string, receiverId?: string | null) => Promise<void>;
}

const DRIVER_CHIPS = [
  'Saya sudah sampai di titik jemput',
  'Sedang menuju lokasi penjemputan',
  'Mohon tunggu sebentar ya pak/bu',
  'Saya menunggu dekat lobi utama',
  'Perjalanan kita mulai ya',
];

const USER_CHIPS = [
  'Saya sedang menuju ke mobil',
  'Tunggu sebentar, sedang turun lift',
  'Saya tunggu di dekat pintu lobi',
  'Mobilnya parkir di sebelah mana ya pak?',
  'Saya sudah di titik jemput',
];

export function ChatDrawer({
  isOpen,
  onClose,
  partnerId,
  partnerName,
  partnerRole = 'Driver',
  currentUserRole = 'USER',
  currentUserId,
  onStartCall,
  messages,
  isLoading,
  isSending,
  error,
  sendMessage,
}: ChatDrawerProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeChips = currentUserRole === 'DRIVER' ? DRIVER_CHIPS : USER_CHIPS;

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    const textToSend = inputText;
    setInputText('');
    await sendMessage(textToSend, partnerId);
  };

  const handleQuickChip = (chip: string) => {
    sendMessage(chip, partnerId);
  };

  if (!isOpen) return null;

  const roleLabel =
    partnerRole === 'DRIVER'
      ? 'Driver operasional'
      : partnerRole === 'ADMIN'
        ? 'Dispatcher admin'
        : 'Penumpang';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Chat dengan ${partnerName}`}
    >
      <div
        className="flex h-[86dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--radius-2xl)] border border-[var(--border)] bg-white shadow-[var(--shadow-float)] sm:h-[620px] sm:max-h-[88vh] sm:rounded-[var(--radius-2xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--slate-navy)] text-[0.6875rem] font-semibold text-white">
              {partnerName.slice(0, 2).toUpperCase() || 'KC'}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-[0.8125rem] font-semibold text-slate-900">{partnerName}</h3>
              <p className="flex items-center gap-1.5 text-[0.625rem] font-medium uppercase tracking-[0.06em] text-slate-400">
                <span className="size-1.5 rounded-full bg-[var(--status-active-fg)]" aria-hidden="true" />
                {roleLabel}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {onStartCall && partnerId && (
              <button
                type="button"
                onClick={() => onStartCall(partnerId, partnerName, partnerRole)}
                title="Panggilan suara in-app"
                aria-label="Mulai panggilan suara"
                className="icon-button size-9"
              >
                <Phone className="size-4" strokeWidth={1.9} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Tutup obrolan"
              aria-label="Tutup obrolan"
              className="icon-button size-9"
            >
              <X className="size-4" strokeWidth={2.1} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-2.5 overflow-y-auto bg-[var(--canvas)] px-4 py-4">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-slate-500">
              <Spinner size="md" className="text-[var(--kcic-red)]" />
              <p>Memuat percakapan…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <span className="mb-3 grid size-12 place-items-center rounded-full border border-[var(--border)] bg-white text-slate-400">
                <MessageSquare className="size-5" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h4 className="text-[0.8125rem] font-semibold text-slate-900">Mulai percakapan</h4>
              <p className="mt-1 max-w-xs text-[0.6875rem] leading-relaxed text-slate-500">
                Kirim pesan langsung ke {partnerName} terkait penjemputan tanpa membagikan nomor pribadi.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const formattedTime = new Date(m.created_at).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              });

              if (m.message.startsWith('Panggilan')) {
                const lower = m.message.toLowerCase();
                const isMissed = lower.includes('tak terjawab') || lower.includes('ditolak');
                return (
                  <div key={m.id} className="flex justify-center py-0.5">
                    <span
                      className={`pill ${isMissed ? 'pill-error' : 'pill-active'}`}
                    >
                      {isMissed ? (
                        <PhoneOff className="size-2.5" strokeWidth={2.4} aria-hidden="true" />
                      ) : (
                        <Phone className="size-2.5" strokeWidth={2.4} aria-hidden="true" />
                      )}
                      <span>{m.message}</span>
                      <span className="tabular-nums opacity-60">{formattedTime}</span>
                    </span>
                  </div>
                );
              }

              const isMe = m.sender_id === currentUserId;

              return (
                <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[82%] rounded-[var(--radius-lg)] px-3 py-2 shadow-[var(--shadow-xs)] ${
                      isMe
                        ? 'rounded-br-[var(--radius-xs)] bg-[var(--slate-navy)] text-white'
                        : 'rounded-bl-[var(--radius-xs)] border border-[var(--border)] bg-white text-slate-900'
                    }`}
                  >
                    {!isMe && (
                      <p className="mb-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-slate-400">
                        {m.sender_name || partnerName}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                      {m.message}
                    </p>
                    <div
                      className={`mt-1 flex items-center justify-end gap-1 text-[0.625rem] tabular-nums ${
                        isMe ? 'text-slate-400' : 'text-slate-400'
                      }`}
                    >
                      <span>{formattedTime}</span>
                      {isMe && (
                        <span
                          title={m.is_read ? 'Sudah dibaca' : 'Terkirim'}
                          className={m.is_read ? 'text-[#6EE7B7]' : 'text-slate-400'}
                        >
                          <Check className="size-3" strokeWidth={2.4} aria-hidden="true" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick replies */}
        <div className="border-t border-[var(--border-subtle)] bg-white px-3 py-2">
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {activeChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickChip(chip)}
                className="chip shrink-0 py-1 text-[0.625rem]"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Composer */}
        <form onSubmit={handleSend} className="border-t border-[var(--border-subtle)] bg-white p-3">
          {error && (
            <p role="alert" className="mb-2 truncate text-[0.6875rem] font-medium text-[var(--status-error-fg)]">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="chat-message-input">
              Tulis pesan
            </label>
            <input
              id="chat-message-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Tulis pesan ke ${partnerName}…`}
              className="flex-1"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              aria-label="Kirim pesan"
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] bg-[var(--slate-navy)] text-white transition-colors hover:bg-[var(--charcoal)] disabled:opacity-40"
            >
              {isSending ? (
                <Spinner size="sm" className="text-white" />
              ) : (
                <Send className="size-4" strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
